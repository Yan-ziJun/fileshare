/**
 * 发个东西 - 局域网传输工具
 * 优化版本 v1.2.0
 * 包含：错误处理、重连机制、内存优化、暂停/继续、浏览器通知
 */

// ==========================================
// 模块1: 工具函数 (Utils)
// ==========================================
const Utils = {
  /**
   * HTML 转义，防止 XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * 获取文件图标
   */
  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄', doc: '📝', docx: '📝', txt: '📃',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
      mp4: '🎥', avi: '🎥', mov: '🎥', mkv: '🎥', webm: '🎥',
      mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵',
      zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
      js: '💻', ts: '💻', html: '💻', css: '💻', py: '💻', java: '💻',
      json: '📋', xml: '📋', csv: '📊', xlsx: '📊', xls: '📊'
    };
    return icons[ext] || '📁';
  },

  /**
   * 生成唯一 ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// ==========================================
// 模块2: 通知管理器 (NotificationManager)
// ==========================================
class NotificationManager {
  constructor() {
    this.permission = 'default';
    this.init();
  }

  init() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      return false;
    }
    if (this.permission === 'granted') {
      return true;
    }
    this.permission = await Notification.requestPermission();
    return this.permission === 'granted';
  }

  show(title, options = {}) {
    if (!('Notification' in window) || this.permission !== 'granted') {
      return;
    }
    if (document.visibilityState === 'visible') {
      return; // 页面可见时不显示通知
    }
    new Notification(title, {
      icon: '📦',
      ...options
    });
  }
}

// ==========================================
// 模块3: 文件传输管理器 (FileTransferManager)
// ==========================================
class FileTransferManager {
  constructor(app) {
    this.app = app;
    this.transfers = new Map(); // 活跃的传输任务
    this.CHUNK_SIZE = 64 * 1024; // 64KB
    this.MAX_MEMORY_SIZE = 500 * 1024 * 1024; // 500MB 最大内存占用
  }

  /**
   * 创建发送任务
   */
  createSendTask(file, targets) {
    const fileId = Utils.generateId();
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    
    const task = {
      fileId,
      file,
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
      currentChunk: 0,
      targets,
      status: 'pending', // pending, sending, paused, completed, cancelled, error
      progress: 0,
      sentBytes: 0,
      startTime: Date.now(),
      lastProgressTime: Date.now()
    };

    this.transfers.set(fileId, task);
    return task;
  }

  /**
   * 创建接收任务
   */
  createReceiveTask(fileId, fileName, fileSize, totalChunks, senderName) {
    const task = {
      fileId,
      fileName,
      fileSize,
      totalChunks,
      currentChunk: 0,
      chunks: [],
      status: 'receiving',
      progress: 0,
      receivedBytes: 0,
      senderName,
      startTime: Date.now()
    };

    this.transfers.set(fileId, task);
    return task;
  }

  /**
   * 开始发送文件
   */
  async startSend(fileId) {
    const task = this.transfers.get(fileId);
    if (!task || (task.status !== 'pending' && task.status !== 'paused')) return;

    task.status = 'sending';
    
    // 如果是暂停后恢复，不需要重新发送元数据和添加进度项
    const isResuming = task.currentChunk > 0;
    
    if (!isResuming) {
      // 发送文件元数据
      const sendMethod = task.targets 
        ? (data) => this.app.sendToTargets(task.targets, data)
        : (data) => this.app.broadcast(data);

      sendMethod({
        type: 'file-meta',
        fileId: task.fileId,
        fileName: task.fileName,
        fileSize: task.fileSize,
        totalChunks: task.totalChunks,
        senderName: this.app.nickname || '匿名'
      });

      this.app.addProgressItem(task);
    }

    // 立即更新状态为发送中
    this.app.updateProgress(fileId, task.progress, task.sentBytes, '发送中...');
    
    // 开始发送数据块
    await this.sendChunks(fileId);
  }

  /**
   * 发送文件块
   */
  async sendChunks(fileId) {
    const task = this.transfers.get(fileId);
    if (!task || task.status !== 'sending') return;

    const sendMethod = task.targets 
      ? (data) => this.app.sendToTargets(task.targets, data)
      : (data) => this.app.broadcast(data);

    while (task.currentChunk < task.totalChunks && task.status === 'sending') {
      const chunk = task.file.slice(
        task.currentChunk * this.CHUNK_SIZE,
        Math.min((task.currentChunk + 1) * this.CHUNK_SIZE, task.fileSize)
      );

      const arrayBuffer = await chunk.arrayBuffer();
      
      sendMethod({
        type: 'file-chunk',
        fileId: task.fileId,
        chunk: arrayBuffer,
        chunkIndex: task.currentChunk,
        totalChunks: task.totalChunks
      });

      task.currentChunk++;
      task.sentBytes = Math.min(task.currentChunk * this.CHUNK_SIZE, task.fileSize);
      task.progress = Math.round((task.currentChunk / task.totalChunks) * 100);

      // 每次都更新进度，让用户看到更流畅的进度
      this.app.updateProgress(task.fileId, task.progress, task.sentBytes);
      task.lastProgressTime = Date.now();

      // 给浏览器一些喘息时间，防止 UI 卡顿
      await Utils.delay(5);
    }

    if (task.status === 'sending') {
      // 传输完成
      task.status = 'completed';
      task.progress = 100;
      
      sendMethod({
        type: 'file-complete',
        fileId: task.fileId,
        fileSize: task.fileSize
      });

      this.app.updateProgress(task.fileId, 100, task.fileSize, '已完成');
      this.app.addToHistory('sent', task.fileName, task.fileSize);
      this.app.showToast(`已发送: ${task.fileName}`, 'success');
      
      this.app.notificationManager.show('文件发送成功', {
        body: `${task.fileName} (${Utils.formatFileSize(task.fileSize)})`
      });

      // 清理任务
      setTimeout(() => this.cleanupTask(fileId), 2000);
    }
  }

  /**
   * 暂停传输
   */
  pauseTransfer(fileId) {
    const task = this.transfers.get(fileId);
    if (!task || task.status !== 'sending') return;

    task.status = 'paused';
    this.app.updateProgress(fileId, task.progress, task.sentBytes, '已暂停');
    this.app.showToast('传输已暂停', 'success');
  }

  /**
   * 继续传输
   */
  resumeTransfer(fileId) {
    const task = this.transfers.get(fileId);
    if (!task || task.status !== 'paused') return;

    this.startSend(fileId);
    this.app.showToast('传输已继续', 'success');
  }

  /**
   * 取消传输
   */
  cancelTransfer(fileId) {
    const task = this.transfers.get(fileId);
    if (!task) return;

    task.status = 'cancelled';
    
    const sendMethod = task.targets 
      ? (data) => this.app.sendToTargets(task.targets, data)
      : (data) => this.app.broadcast(data);

    sendMethod({
      type: 'file-cancelled',
      fileId: fileId,
      fileName: task.fileName
    });

    const progressItem = document.getElementById('progress-item-' + fileId);
    if (progressItem) {
      progressItem.remove();
    }

    this.cleanupTask(fileId);
    this.app.showToast('已取消发送', 'error');
  }

  /**
   * 处理接收到的文件块
   */
  handleChunk(fileId, chunk, chunkIndex, totalChunks) {
    let task = this.transfers.get(fileId);
    
    if (!task) {
      console.warn('Unknown file transfer:', fileId);
      return;
    }

    if (task.status !== 'receiving') return;

    task.chunks[chunkIndex] = chunk;
    task.receivedBytes += chunk.byteLength;
    task.currentChunk = Math.max(task.currentChunk, chunkIndex + 1);
    task.progress = Math.round((task.currentChunk / totalChunks) * 100);

    this.app.updateProgress(fileId, task.progress, task.receivedBytes);

    // 内存检查
    if (task.receivedBytes > this.MAX_MEMORY_SIZE) {
      this.app.showToast('文件过大，内存不足', 'error');
      task.status = 'error';
      this.cleanupTask(fileId);
      return;
    }
  }

  /**
   * 完成文件接收
   */
  completeReceive(fileId) {
    const task = this.transfers.get(fileId);
    if (!task || task.status !== 'receiving') return;

    task.status = 'completed';

    // 检查是否所有块都收到
    const missingChunks = [];
    for (let i = 0; i < task.totalChunks; i++) {
      if (!task.chunks[i]) {
        missingChunks.push(i);
      }
    }

    if (missingChunks.length > 0) {
      this.app.showToast('文件传输不完整，缺少数据块', 'error');
      this.cleanupTask(fileId);
      return;
    }

    // 组装文件
    const blob = new Blob(task.chunks);
    this.app.addReceivedFile(task.fileName, task.fileSize, blob);
    this.app.addToHistory('received', task.fileName, task.fileSize);
    
    this.app.updateProgress(fileId, 100, task.fileSize, '已完成');
    this.app.showToast(`已接收: ${task.fileName}`, 'success');

    this.app.notificationManager.show('收到新文件', {
      body: `${task.senderName} 发送了 ${task.fileName}`
    });

    // 清理任务
    setTimeout(() => this.cleanupTask(fileId), 2000);
  }

  /**
   * 取消接收
   */
  cancelReceive(fileId) {
    const task = this.transfers.get(fileId);
    if (!task) return;

    this.cleanupTask(fileId);
    const progressItem = document.getElementById('progress-item-' + fileId);
    if (progressItem) {
      progressItem.remove();
    }
  }

  /**
   * 清理任务，释放内存
   */
  cleanupTask(fileId) {
    const task = this.transfers.get(fileId);
    if (task) {
      // 释放大块数据
      if (task.chunks) {
        task.chunks = [];
      }
      if (task.file) {
        task.file = null;
      }
      this.transfers.delete(fileId);
    }
  }

  /**
   * 清理所有任务
   */
  cleanupAll() {
    for (const fileId of this.transfers.keys()) {
      this.cleanupTask(fileId);
    }
  }
}

// ==========================================
// 模块4: 连接管理器 (ConnectionManager)
// ==========================================
class ConnectionManager {
  constructor(app) {
    this.app = app;
    this.peer = null;
    this.connections = [];
    this.heartbeatInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.isReconnecting = false;
    this.pendingPeer = null;
  }

  /**
   * ICE 服务器配置（STUN + TURN）
   * 用于 NAT 穿透，确保 P2P 连接在各种网络环境下都能工作
   */
  get iceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
        username: 'webrtc',
        credential: 'webrtc'
      }
    ];
  }

  /**
   * PeerJS 信令服务器配置
   * 使用官方默认信令服务器，同时配置 ICE 服务器用于 NAT 穿透
   */
  get peerConfig() {
    return {
      debug: 1,
      config: {
        iceServers: this.iceServers,
        iceTransportPolicy: 'all',
        sdpSemantics: 'unified-plan'
      }
    };
  }

  /**
   * 初始化 Peer 连接
   */
  initPeer(customId = null) {
    return new Promise((resolve, reject) => {
      if (this.peer) {
        this.peer.destroy();
      }

      if (this.pendingPeer) {
        this.pendingPeer.destroy();
      }

      const config = this.peerConfig;
      this.pendingPeer = new Peer(customId, config);

      this.pendingPeer.on('open', (id) => {
        this.peer = this.pendingPeer;
        this.pendingPeer = null;
        this.app.peerId = id;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve(id);
      });

      this.pendingPeer.on('connection', (conn) => {
        if (this.peer) {
          this.handleNewConnection(conn);
        }
      });

      this.pendingPeer.on('error', (err) => {
        console.error('Peer error:', err);
        const fatalTypes = ['unavailable-id', 'invalid-id', 'fatal-id-collision'];
        if (fatalTypes.includes(err.type)) {
            this.pendingPeer = null;
            reject(err);
        } else if (err.type === 'peer-unavailable') {
            this.pendingPeer = null;
            reject(new Error('房间不存在或对方已离线'));
        } else {
            console.warn('Peer init error (will retry via caller):', err.type);
        }
      });

      this.pendingPeer.on('disconnected', () => {
        console.log('Peer disconnected');
        this.handleDisconnect();
      });

      this.pendingPeer.on('close', () => {
        console.log('Peer closed');
        this.stopHeartbeat();
      });

      setTimeout(() => {
        if (!this.peer && this.pendingPeer) {
          this.pendingPeer.destroy();
          this.pendingPeer = null;
          reject(new Error('连接超时，请检查网络后重试'));
        }
      }, 15000);
    });
  }

  /**
   * 处理新连接
   */
  handleNewConnection(conn) {
    this.connections.push(conn);

    conn.on('open', () => {
      console.log('Connection opened with:', conn.peer);
      this.app.pendingConnections.add(conn.peer);

      if (!this.app.isHost && this.app.roomId && conn.peer === this.app.roomId) {
        // 加入者连接到房主成功
        this.app.devices[this.app.roomId] = {
          id: this.app.roomId,
          nickname: '房主',
          joinedAt: Date.now()
        };
        this.app.ui.renderDevicesList(this.app.devices, this.app.peerId, this.app.isHost);
        this.app.connectToAllDevices();
        setTimeout(() => {
          conn.send({ type: 'request-devices', from: this.app.peerId });
        }, 300);
        // 加入者连接到房主成功后更新状态并跳转
        this.app.ui.updateConnectionStatus('connected', '已连接');
        this.app.ui.switchTab('file');
      }

      if (this.app.isHost && conn.peer !== this.app.peerId) {
        // 房主收到新连接
        const nicknameFromMeta = conn.metadata?.nickname || '匿名';
        if (!this.app.devices[conn.peer]) {
          this.app.devices[conn.peer] = {
            id: conn.peer,
            nickname: nicknameFromMeta,
            joinedAt: Date.now()
          };
          this.app.ui.renderDevicesList(this.app.devices, this.app.peerId, this.app.isHost);
          this.app.broadcastNewDeviceImmediate(conn.peer, nicknameFromMeta);
        }
        // 房主有新设备加入时更新状态
        const otherDevicesCount = Object.keys(this.app.devices).length - 1;
        if (otherDevicesCount > 0) {
          this.app.ui.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
        }
      }

      this.app.sendNickname(conn);
    });

    conn.on('data', (data) => {
      this.app.handleData(data, conn);
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      this.app.pendingConnections.delete(conn.peer);
      this.app.removeDevice(conn.peer);
      this.connections = this.connections.filter(c => c !== conn);
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.app.showToast('连接错误', 'error');
    });
  }

  /**
   * 连接到房间
   */
  connectToRoom(roomId) {
    try {
      const conn = this.peer.connect(roomId, {
        reliable: true,
        metadata: { nickname: this.app.nickname }
      });
      this.handleNewConnection(conn);
    } catch (error) {
      console.error('Failed to connect to room:', error);
      this.app.showToast('连接房间失败', 'error');
    }
  }

  /**
   * 连接到指定设备
   */
  connectToDevice(deviceId) {
    const existingConn = this.connections.find(c => c.peer === deviceId && c.open);
    if (existingConn) {
      return existingConn;
    }

    try {
      const conn = this.peer.connect(deviceId, {
        reliable: true,
        metadata: { nickname: this.app.nickname }
      });
      this.handleNewConnection(conn);
      return conn;
    } catch (error) {
      console.error('Failed to connect to device:', error);
      return null;
    }
  }

  /**
   * 处理 Peer 错误
   */
  handlePeerError(err) {
    const errorMap = {
      'unavailable-id': { msg: '房间号已被占用，请尝试其他房间', status: 'error' },
      'invalid-id': { msg: '房间号格式无效', status: 'error' },
      'peer-unavailable': { msg: '房间不存在或对方已离线', status: 'error' },
      'network': { msg: '网络异常，正在尝试重连...', status: 'reconnecting' },
      'disconnected': { msg: '连接已断开', status: 'reconnecting' },
      'server-error': { msg: '信令服务器错误，正在重试...', status: 'reconnecting' },
      'signaling': { msg: '信令连接异常，正在重试...', status: 'reconnecting' },
      'invalid-key': { msg: '密钥无效', status: 'error' },
      'fatal-id-collision': { msg: 'ID 冲突，请稍后重试', status: 'error' }
    };

    const handler = errorMap[err.type] || { msg: `连接错误: ${err.type || err.message}`, status: 'error' };

    this.app.showToast(handler.msg, handler.status === 'error' ? 'error' : 'success');
    this.app.updateConnectionStatus(handler.status, handler.msg);

    const retryableErrors = ['network', 'disconnected', 'server-error', 'signaling'];
    if (retryableErrors.includes(err.type)) {
      this.attemptReconnect();
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnect() {
    this.stopHeartbeat();
    if (this.app.roomId && !this.isReconnecting) {
      this.app.showToast('连接断开，正在尝试重连...', 'success');
      this.attemptReconnect();
    }
  }

  /**
   * 尝试重连（带指数退避和状态保持）
   */
  async attemptReconnect() {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts && this.app.roomId) {
        this.app.showToast('重连失败，请刷新页面重试', 'error');
        this.app.updateConnectionStatus('error', '重连失败');
      }
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    this.app.updateConnectionStatus('reconnecting', `重连中 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.app.showToast(`尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'success');

    await Utils.delay(delay);

    try {
      if (this.app.isHost) {
        await this.initPeer(this.app.roomId);
        this.app.devices[this.app.peerId] = {
          id: this.app.peerId,
          nickname: this.app.nickname,
          joinedAt: Date.now()
        };
        this.app.ui.renderDevicesList(this.app.devices, this.app.peerId, this.app.isHost);
        this.app.ui.updateConnectionStatus('waiting', '等待连接');
        this.app.ui.showToast('重连成功！', 'success');
      } else {
        await this.initPeer();
        this.app.devices[this.app.peerId] = {
          id: this.app.peerId,
          nickname: this.app.nickname,
          joinedAt: Date.now()
        };
        this.app.ui.renderDevicesList(this.app.devices, this.app.peerId, this.app.isHost);
        await Utils.delay(500);
        this.connectToRoom(this.app.roomId);
      }
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Reconnect failed:', error);
      this.isReconnecting = false;
      this.attemptReconnect();
    }
  }

  /**
   * 启动心跳
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      const openConnections = this.connections.filter(c => c.open);
      openConnections.forEach(conn => {
        if (conn.peer !== this.app.peerId) {
          try {
            conn.send({ type: 'heartbeat', time: Date.now() });
          } catch (e) {
            console.warn('Failed to send heartbeat:', e);
          }
        }
      });
    }, 10000);
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 断开所有连接
   */
  disconnectAll() {
    this.stopHeartbeat();
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.close();
      }
    });
    this.connections = [];
    
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
  }
}

// ==========================================
// 模块5: UI 控制器 (UIController)
// ==========================================
class UIController {
  constructor(app) {
    this.app = app;
    this.elements = {};
    this.initElements();
    this.initEventListeners();
  }

  initElements() {
    this.elements = {
      nicknameInput: document.getElementById('nicknameInput'),
      createRoomBtn: document.getElementById('createRoomBtn'),
      joinRoomBtn: document.getElementById('joinRoomBtn'),
      cancelJoinBtn: document.getElementById('cancelJoinBtn'),
      disconnectBtn: document.getElementById('disconnectBtn'),
      confirmJoinBtn: document.getElementById('confirmJoinBtn'),
      roomDisplay: document.getElementById('roomDisplay'),
      roomShare: document.getElementById('roomShare'),
      roomShareCode: document.getElementById('roomShareCode'),
      copyRoomBtn: document.getElementById('copyRoomBtn'),
      joinInputDisplay: document.getElementById('joinInputDisplay'),
      roomId: document.getElementById('roomId'),
      connectionStatus: document.getElementById('connectionStatus'),
      fileConnectionStatus: document.getElementById('file-connection-status'),
      messageConnectionStatus: document.getElementById('message-connection-status'),
      roomIdInput: document.getElementById('roomIdInput'),
      devicesList: document.getElementById('devicesList'),
      devicesListContent: document.getElementById('devicesListContent'),
      fileTargetRoom: document.querySelector('input[name="fileTarget"][value="room"]'),
      fileTargetSpecific: document.querySelector('input[name="fileTarget"][value="specific"]'),
      fileTargetDevices: document.getElementById('fileTargetDevices'),
      fileTargetDevicesList: document.getElementById('fileTargetDevicesList'),
      messageTargetRoom: document.querySelector('input[name="messageTarget"][value="room"]'),
      messageTargetSpecific: document.querySelector('input[name="messageTarget"][value="specific"]'),
      messageTargetDevices: document.getElementById('messageTargetDevices'),
      messageTargetDevicesList: document.getElementById('messageTargetDevicesList'),
      dropZone: document.getElementById('dropZone'),
      fileInput: document.getElementById('fileInput'),
      fileList: document.getElementById('fileList'),
      sendFilesBtn: document.getElementById('sendFilesBtn'),
      clearProgressBtn: document.getElementById('clearProgressBtn'),
      messageInput: document.getElementById('messageInput'),
      sendMessageBtn: document.getElementById('sendMessageBtn'),
      messagesList: document.getElementById('messagesList'),
      progressList: document.getElementById('progressList'),
      progressSection: document.querySelector('.progress-section'),
      transferHistory: document.getElementById('transferHistory'),
      receivedFilesList: document.getElementById('receivedFilesList'),
      toast: document.getElementById('toast')
    };
  }

  initEventListeners() {
    // Tab 切换事件
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
      item.addEventListener('click', () => {
        const tabName = item.dataset.tab;
        this.switchTab(tabName);
      });
    });

    this.elements.createRoomBtn.addEventListener('click', () => this.app.createRoom());
    this.elements.joinRoomBtn.addEventListener('click', () => this.showJoinForm());
    this.elements.confirmJoinBtn.addEventListener('click', () => this.app.joinRoom());
    this.elements.cancelJoinBtn.addEventListener('click', () => this.cancelJoin());
    this.elements.disconnectBtn.addEventListener('click', () => this.app.disconnect());
    
    if (this.elements.copyRoomBtn) {
      this.elements.copyRoomBtn.addEventListener('click', () => {
        const code = this.elements.roomShareCode.textContent;
        navigator.clipboard.writeText(code).then(() => {
          this.showToast('已复制: ' + code, 'success');
        }).catch(() => {
          this.showToast('复制失败', 'error');
        });
      });
    }
    
    this.elements.roomIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.app.joinRoom();
    });
    
    this.elements.roomIdInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
    });

    this.elements.fileInput.addEventListener('change', (e) => this.app.handleFileSelect(e));
    this.elements.sendFilesBtn.addEventListener('click', () => this.app.sendFiles());
    this.elements.clearProgressBtn.addEventListener('click', () => this.app.clearProgress());
    this.elements.sendMessageBtn.addEventListener('click', () => this.app.sendMessage());

    if (this.elements.fileTargetRoom) {
      this.elements.fileTargetRoom.addEventListener('change', () => {
        this.app.onFileTargetChange();
      });
    }
    if (this.elements.fileTargetSpecific) {
      this.elements.fileTargetSpecific.addEventListener('change', () => {
        this.app.onFileTargetChange();
      });
    }
    if (this.elements.messageTargetRoom) {
      this.elements.messageTargetRoom.addEventListener('change', () => {
        this.app.onMessageTargetChange();
      });
    }
    if (this.elements.messageTargetSpecific) {
      this.elements.messageTargetSpecific.addEventListener('change', () => {
        this.app.onMessageTargetChange();
      });
    }

    this.elements.dropZone.addEventListener('click', () => {
      this.elements.fileInput.click();
    });

    this.elements.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.elements.dropZone.classList.add('dragover');
    });

    this.elements.dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.elements.dropZone.classList.remove('dragover');
    });

    this.elements.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.elements.dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.app.handleFileDrop(e.dataTransfer.files);
      }
    });

    this.elements.nicknameInput.addEventListener('input', (e) => {
      this.app.nickname = e.target.value.trim();
      localStorage.setItem('nickname', this.app.nickname);
    });

    this.elements.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.app.sendMessage();
      }
    });

    document.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    const activeTab = document.querySelector(`.tab-item[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}-content`);
    
    if (activeTab) {
      activeTab.classList.add('active');
    }
    if (activeContent) {
      activeContent.classList.add('active');
    }
  }

  showJoinForm() {
    this.elements.roomDisplay.classList.add('hidden');
    this.elements.joinInputDisplay.classList.remove('hidden');
    this.elements.createRoomBtn.classList.add('hidden');
    this.elements.joinRoomBtn.classList.add('hidden');
    this.elements.confirmJoinBtn.classList.remove('hidden');
    this.elements.cancelJoinBtn.classList.remove('hidden');
    this.elements.roomIdInput.focus();
  }

  cancelJoin() {
    this.elements.roomDisplay.classList.remove('hidden');
    this.elements.joinInputDisplay.classList.add('hidden');
    this.elements.createRoomBtn.classList.remove('hidden');
    this.elements.joinRoomBtn.classList.remove('hidden');
    this.elements.confirmJoinBtn.classList.add('hidden');
    this.elements.cancelJoinBtn.classList.add('hidden');
    this.elements.roomIdInput.value = '';
  }

  showToast(message, type = 'success') {
    this.elements.toast.textContent = message;
    this.elements.toast.className = 'toast show ' + type;
    
    setTimeout(() => {
      this.elements.toast.classList.remove('show');
    }, 3000);
  }

  updateConnectionStatus(status, message) {
    this.elements.connectionStatus.textContent = message;
    this.elements.connectionStatus.className = 'status ' + status;
    
    if (this.elements.fileConnectionStatus) {
      this.elements.fileConnectionStatus.textContent = message;
      this.elements.fileConnectionStatus.className = 'status ' + status;
    }
    
    if (this.elements.messageConnectionStatus) {
      this.elements.messageConnectionStatus.textContent = message;
      this.elements.messageConnectionStatus.className = 'status ' + status;
    }
    
    if (status === 'connected') {
      this.switchTab('file');
    }
  }

  renderDevicesList(devices, peerId, isHost) {
    let deviceIds = Object.keys(devices).filter(id => id !== peerId);
    
    if (isHost) {
      deviceIds = deviceIds.filter(id => id !== this.app.roomId);
    }
    
    if (deviceIds.length === 0) {
      this.elements.devicesList.classList.add('hidden');
      return;
    }

    this.elements.devicesList.classList.remove('hidden');

    const icons = ['💻', '📱', '📱', '📱', '📱', '💻', '📱', '💻'];
    
    this.elements.devicesListContent.innerHTML = deviceIds.map((id, index) => {
      const device = devices[id];
      const icon = device.nickname.includes('手机') ? '📱' : 
                   device.nickname.includes('电脑') ? '💻' : 
                   icons[index % icons.length];
      return `
        <div class="device-item">
          <span class="device-icon">${icon}</span>
          <span class="device-name">${device.nickname}</span>
          <span class="device-status"></span>
        </div>
      `;
    }).join('');
  }

  renderTargetDevicesList(type, devices, peerId, selectedTargets) {
    const deviceList = type === 'file' 
      ? this.elements.fileTargetDevicesList 
      : this.elements.messageTargetDevicesList;

    const deviceIds = Object.keys(devices).filter(id => id !== peerId);

    if (deviceIds.length === 0) {
      deviceList.innerHTML = '<div class="empty-tip">暂无可选择的设备</div>';
      return;
    }

    const icons = ['💻', '📱', '📱', '📱', '📱', '💻', '📱', '💻'];

    deviceList.innerHTML = deviceIds.map((id, index) => {
      const device = devices[id];
      const icon = device.nickname.includes('手机') ? '📱' :
                   device.nickname.includes('电脑') ? '💻' :
                   icons[index % icons.length];
      const isSelected = selectedTargets.has(id);

      return `
        <div class="target-device-item ${isSelected ? 'selected' : ''}" data-device-id="${id}" data-type="${type}">
          <input type="checkbox" ${isSelected ? 'checked' : ''}>
          <span class="target-device-checkbox"></span>
          <span class="target-device-icon">${icon}</span>
          <span class="target-device-name">${device.nickname}</span>
        </div>
      `;
    }).join('');

    deviceList.querySelectorAll('.target-device-item').forEach(item => {
      item.addEventListener('click', () => {
        const deviceId = item.dataset.deviceId;
        const itemType = item.dataset.type;
        const targets = itemType === 'file' 
          ? this.app.selectedFileTargets 
          : this.app.selectedMessageTargets;

        if (targets.has(deviceId)) {
          targets.delete(deviceId);
          item.classList.remove('selected');
          item.querySelector('input').checked = false;
        } else {
          targets.add(deviceId);
          item.classList.add('selected');
          item.querySelector('input').checked = true;
        }
      });
    });
  }

  renderFileList(files) {
    this.elements.fileList.innerHTML = files.map((file, index) => `
      <div class="file-item" data-index="${index}">
        <div class="file-info">
          <span class="file-icon">${Utils.getFileIcon(file.name)}</span>
          <div class="file-details">
            <span class="file-name">${file.name}</span>
            <span class="file-size">${Utils.formatFileSize(file.size)}</span>
          </div>
        </div>
        <button class="file-remove">×</button>
      </div>
    `).join('');

    this.elements.fileList.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.file-remove');
      if (removeBtn) {
        const fileItem = removeBtn.closest('.file-item');
        const index = parseInt(fileItem.dataset.index, 10);
        if (!isNaN(index) && index >= 0 && index < files.length) {
          this.app.removeFile(index);
        }
      }
    });
  }

  addProgressItem(task) {
    this.elements.progressSection.classList.remove('hidden');
    
    const progressItem = document.createElement('div');
    progressItem.id = 'progress-item-' + task.fileId;
    progressItem.className = 'progress-item';
    progressItem.innerHTML = `
      <div class="progress-header">
        <span class="progress-name">${task.fileName}</span>
        <span class="progress-status">准备中...</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: 0%"></div>
      </div>
      <div class="progress-details">
        <span>0%</span>
        <span>0 B / ${Utils.formatFileSize(task.fileSize)}</span>
      </div>
      <div class="progress-actions">
        <button class="btn-pause" data-action="pause" data-id="${task.fileId}">⏸️ 暂停</button>
        <button class="btn-cancel" data-action="cancel" data-id="${task.fileId}">❌ 取消</button>
      </div>
    `;

    this.elements.progressList.appendChild(progressItem);

    progressItem.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      
      const action = btn.dataset.action;
      const fileId = btn.dataset.id;
      
      if (action === 'pause') {
        const task = this.app.fileTransfer.transfers.get(fileId);
        if (task?.status === 'sending') {
          this.app.fileTransfer.pauseTransfer(fileId);
          btn.textContent = '▶️ 继续';
          btn.dataset.action = 'resume';
        } else if (task?.status === 'paused') {
          this.app.fileTransfer.resumeTransfer(fileId);
          btn.textContent = '⏸️ 暂停';
          btn.dataset.action = 'pause';
        }
      } else if (action === 'cancel') {
        this.app.fileTransfer.cancelTransfer(fileId);
      }
    });
  }

  updateProgress(fileId, progress, bytes, status = null) {
    const item = document.getElementById('progress-item-' + fileId);
    if (!item) return;

    const progressBar = item.querySelector('.progress-bar');
    const progressStatus = item.querySelector('.progress-status');
    const progressDetails = item.querySelectorAll('.progress-details span');
    const progressActions = item.querySelector('.progress-actions');

    if (progressBar) {
      progressBar.style.width = progress + '%';
    }

    if (progressDetails.length >= 2) {
      const task = this.app.fileTransfer.transfers.get(fileId);
      progressDetails[0].textContent = progress + '%';
      progressDetails[1].textContent = `${Utils.formatFileSize(bytes)}${task ? ' / ' + Utils.formatFileSize(task.fileSize) : ''}`;
    }

    if (status) {
      progressStatus.textContent = status;
    }

    // 当状态是已完成时，隐藏按钮
    if (status && status.includes('已完成')) {
      if (progressActions) {
        progressActions.style.display = 'none';
      }
    }
  }

  renderMessages(messages) {
    if (messages.length === 0) {
      this.elements.messagesList.innerHTML = '<p class="empty-tip">暂无消息</p>';
      return;
    }

    this.elements.messagesList.innerHTML = messages.map(msg => `
      <div class="message-item ${msg.type}">
        <div class="message-sender">${msg.sender} · ${msg.time}</div>
        <div class="message-content">${Utils.escapeHtml(msg.content)}</div>
      </div>
    `).join('');

    this.scrollMessagesToBottom();
  }

  scrollMessagesToBottom() {
    this.elements.messagesList.scrollTop = this.elements.messagesList.scrollHeight;
  }

  addMessage(msgObj) {
    this.renderMessages(this.app.messages);
    this.scrollMessagesToBottom();
  }

  renderReceivedFiles(files) {
    if (files.length === 0) {
      this.elements.receivedFilesList.innerHTML = '<p class="empty-tip">暂无接收的文件</p>';
      return;
    }

    this.elements.receivedFilesList.innerHTML = files.map((file, index) => `
      <div class="file-item" data-index="${index}" style="cursor: pointer;">
        <div class="file-info">
          <span class="file-icon">${Utils.getFileIcon(file.name)}</span>
          <div class="file-details">
            <span class="file-name">${file.name}</span>
            <span class="file-size">${Utils.formatFileSize(file.size)}</span>
          </div>
        </div>
      </div>
    `).join('');

    this.elements.receivedFilesList.querySelectorAll('.file-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.app.downloadFile(index);
      });
    });
  }

  renderHistory(history) {
    if (history.length === 0) {
      this.elements.transferHistory.innerHTML = '<p class="empty-tip">暂无记录</p>';
      return;
    }

    this.elements.transferHistory.innerHTML = history.map(item => `
      <div class="history-item">
        <div class="history-info">
          <span class="history-type ${item.type}">${item.type === 'sent' ? '发送' : '接收'}</span>
          <span class="history-name">${item.name}</span>
        </div>
        <span class="history-size">${Utils.formatFileSize(item.size)}</span>
      </div>
    `).join('');
  }

  clearProgressList() {
    this.elements.progressList.innerHTML = '';
    this.elements.progressSection.classList.add('hidden');
  }

  resetRoomUI() {
    this.elements.roomId.textContent = '------';
    this.elements.roomDisplay.classList.remove('hidden');
    this.elements.joinInputDisplay.classList.add('hidden');
    this.elements.createRoomBtn.classList.remove('hidden');
    this.elements.joinRoomBtn.classList.remove('hidden');
    this.elements.confirmJoinBtn.classList.add('hidden');
    this.elements.cancelJoinBtn.classList.add('hidden');
    this.elements.disconnectBtn.classList.add('hidden');
    this.elements.roomIdInput.value = '';
    this.elements.fileList.innerHTML = '';
    this.elements.sendFilesBtn.classList.add('hidden');
    this.elements.devicesList.classList.add('hidden');
    if (this.elements.roomShare) {
      this.elements.roomShare.style.display = 'none';
    }
  }

  switchTab(tabName) {
    // 移除所有 tab 项的 active 状态
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => item.classList.remove('active'));
    
    // 添加当前 tab 的 active 状态
    const activeTab = document.querySelector(`.tab-item[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }
    
    // 隐藏所有 tab 内容
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // 显示对应的 tab 内容
    const activeContent = document.getElementById(`${tabName}-content`);
    if (activeContent) {
      activeContent.classList.add('active');
    }
  }
}

// ==========================================
// 主应用类 (FileTransferApp)
// ==========================================
class FileTransferApp {
  constructor() {
    // 核心状态
    this.roomId = null;
    this.peerId = null;
    this.nickname = localStorage.getItem('nickname') || '匿名';
    this.isHost = false;
    this.devices = {};
    this.pendingConnections = new Set();
    
    // 数据存储
    this.filesToSend = [];
    this.receivedFiles = [];
    this.receivedFileBlobs = {};
    this.transferHistory = [];
    this.messages = [];
    this.selectedFileTargets = new Set();
    this.selectedMessageTargets = new Set();

    // 管理器实例
    this.notificationManager = new NotificationManager();
    this.fileTransfer = new FileTransferManager(this);
    this.connectionManager = new ConnectionManager(this);
    this.ui = new UIController(this);

    this.init();
  }

  init() {
    this.loadNickname();
    this.ui.renderReceivedFiles(this.receivedFiles);
    this.initPageVisibilityListener();
    
    // 请求通知权限
    this.notificationManager.requestPermission();
  }

  loadNickname() {
    if (this.nickname) {
      this.ui.elements.nicknameInput.value = this.nickname;
    }
  }

  initPageVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.roomId) {
        const openConnections = this.connectionManager.connections.filter(c => c.open);
        if (openConnections.length === 0 && !this.connectionManager.isReconnecting) {
          this.disconnect();
        }
      }
    });
  }

  generateRoomId() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return 'yan-' + num;
  }

  async createRoom() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.roomId = this.generateRoomId();
        this.isHost = true;
        this.ui.elements.roomId.textContent = this.roomId;
        this.ui.elements.roomDisplay.classList.remove('hidden');
        this.ui.elements.joinInputDisplay.classList.add('hidden');
        this.ui.elements.createRoomBtn.classList.add('hidden');
        this.ui.elements.joinRoomBtn.classList.add('hidden');
        this.ui.elements.confirmJoinBtn.classList.add('hidden');
        this.ui.elements.cancelJoinBtn.classList.add('hidden');
        this.ui.elements.disconnectBtn.classList.remove('hidden');

        this.ui.updateConnectionStatus('waiting', '正在创建房间...');
        
        await this.connectionManager.initPeer(this.roomId);
        
        this.devices[this.peerId] = {
          id: this.peerId,
          nickname: this.nickname,
          joinedAt: Date.now()
        };
        this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
        
        const shareCode = this.roomId.replace(/^yan-/, '');
        this.ui.elements.roomShare.style.display = 'inline-flex';
        this.ui.elements.roomShareCode.textContent = shareCode;
        
        this.ui.switchTab('file');
        this.ui.showToast('房间创建成功，等待其他设备加入...', 'success');
        return;
      } catch (error) {
        console.error('Failed to create room (attempt ' + (attempt + 1) + '/3):', error);
        if (attempt < 2) {
          this.ui.showToast('创建房间失败，正在重试... (' + (attempt + 1) + '/3)', 'error');
          await Utils.delay(500);
        } else {
          this.ui.showToast('创建房间失败: ' + (error.message || '请检查网络后重试'), 'error');
          this.ui.updateConnectionStatus('error', '创建失败');
          this.disconnect();
        }
      }
    }
  }

  async joinRoom() {
    const inputRoomId = this.ui.elements.roomIdInput.value.trim();
    if (!inputRoomId) {
      this.ui.showToast('请输入房间号后四位', 'error');
      return;
    }

    const fullRoomId = 'yan-' + inputRoomId;
    this.ui.updateConnectionStatus('waiting', '正在连接...');
    this.ui.showToast('正在连接，请稍候...', 'success');

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.roomId = fullRoomId;
        this.isHost = false;
        this.ui.elements.roomId.textContent = this.roomId;
        this.ui.elements.roomDisplay.classList.remove('hidden');
        this.ui.elements.joinInputDisplay.classList.add('hidden');
        this.ui.elements.createRoomBtn.classList.add('hidden');
        this.ui.elements.joinRoomBtn.classList.add('hidden');
        this.ui.elements.confirmJoinBtn.classList.add('hidden');
        this.ui.elements.cancelJoinBtn.classList.add('hidden');
        this.ui.elements.disconnectBtn.classList.remove('hidden');

        await this.connectionManager.initPeer();
        
        this.devices[this.peerId] = {
          id: this.peerId,
          nickname: this.nickname,
          joinedAt: Date.now()
        };
        this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
        
        setTimeout(() => this.connectionManager.connectToRoom(this.roomId), 500);
        return;
      } catch (error) {
        console.error('Failed to join room (attempt ' + (attempt + 1) + '/3):', error);
        if (attempt < 2) {
          this.ui.showToast('加入房间失败，正在重试... (' + (attempt + 1) + '/3)', 'error');
          await Utils.delay(500);
        } else {
          this.ui.showToast('加入房间失败: ' + (error.message || '请检查房间号和网络'), 'error');
          this.ui.updateConnectionStatus('error', '连接失败');
          this.disconnect();
        }
      }
    }
  }

  disconnect() {
    this.connectionManager.disconnectAll();
    this.fileTransfer.cleanupAll();

    this.roomId = null;
    this.isHost = false;
    this.devices = {};
    this.filesToSend = [];
    this.selectedFileTargets.clear();
    this.selectedMessageTargets.clear();

    this.ui.resetRoomUI();
    this.ui.renderReceivedFiles(this.receivedFiles);
    this.ui.renderMessages(this.messages);
    this.ui.renderHistory(this.transferHistory);
    this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
    this.ui.updateConnectionStatus('waiting', '等待连接');
    this.ui.switchTab('settings');
    this.ui.showToast('已断开连接', 'success');
  }

  addDevice(deviceId, nickname) {
    this.devices[deviceId] = {
      id: deviceId,
      nickname: nickname,
      joinedAt: Date.now()
    };
    this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
    this.refreshTargetDeviceLists();

    const otherDevicesCount = Object.keys(this.devices).length - 1;
    if (otherDevicesCount > 0) {
      this.ui.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
    }

    if (this.isHost) {
      this.broadcastNewDevice(deviceId, nickname);
    }

    this.ui.showToast(`${nickname} 加入了房间`, 'success');
    this.notificationManager.show('新设备加入', {
      body: `${nickname} 加入了房间`
    });
  }

  broadcastNewDeviceImmediate(deviceId, nickname) {
    const notifyMessage = {
      type: 'new-device',
      deviceId: deviceId,
      nickname: nickname,
      existingDevices: []
    };

    this.broadcast(notifyMessage);
  }

  broadcastNewDevice(deviceId, nickname) {
    const otherDeviceIds = Object.keys(this.devices).filter(id => id !== deviceId && id !== this.peerId);

    const newDeviceInfo = {
      type: 'new-device',
      deviceId: deviceId,
      nickname: nickname,
      existingDevices: otherDeviceIds.map(id => ({
        deviceId: id,
        nickname: this.devices[id]?.nickname || '匿名'
      }))
    };

    const notifyExistingDevices = {
      type: 'new-device',
      deviceId: deviceId,
      nickname: nickname,
      existingDevices: []
    };

    this.connectionManager.connections.forEach(conn => {
      if (conn.open) {
        if (conn.peer === deviceId) {
          conn.send(newDeviceInfo);
        } else if (otherDeviceIds.includes(conn.peer)) {
          conn.send(notifyExistingDevices);
        }
      }
    });
  }

  removeDevice(deviceId) {
    if (this.devices[deviceId]) {
      const nickname = this.devices[deviceId].nickname;
      delete this.devices[deviceId];
      this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
      this.refreshTargetDeviceLists();
      this.ui.showToast(`${nickname} 已离开`, 'success');
      
      if (this.isHost) {
        this.broadcast({
          type: 'device-left',
          deviceId: deviceId,
          nickname: nickname
        });
      }
    }

    this.connectionManager.connections = this.connectionManager.connections.filter(c => c.peer !== deviceId);

    const otherDevicesCount = Object.keys(this.devices).length - 1;
    if (otherDevicesCount > 0) {
      this.ui.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
    } else {
      this.ui.updateConnectionStatus('waiting', '等待连接');
    }
  }

  refreshTargetDeviceLists() {
    const isFileTargetExpanded = this.ui.elements.fileTargetSpecific && this.ui.elements.fileTargetSpecific.checked;
    const isMessageTargetExpanded = this.ui.elements.messageTargetSpecific && this.ui.elements.messageTargetSpecific.checked;

    if (isFileTargetExpanded) {
      this.ui.renderTargetDevicesList('file', this.devices, this.peerId, this.selectedFileTargets);
    }
    if (isMessageTargetExpanded) {
      this.ui.renderTargetDevicesList('message', this.devices, this.peerId, this.selectedMessageTargets);
    }
  }

  onFileTargetChange() {
    if (this.ui.elements.fileTargetSpecific && this.ui.elements.fileTargetSpecific.checked) {
      this.ui.elements.fileTargetDevices.classList.remove('hidden');
      this.ui.renderTargetDevicesList('file', this.devices, this.peerId, this.selectedFileTargets);
    } else {
      this.ui.elements.fileTargetDevices.classList.add('hidden');
      this.selectedFileTargets.clear();
    }
  }

  onMessageTargetChange() {
    if (this.ui.elements.messageTargetSpecific && this.ui.elements.messageTargetSpecific.checked) {
      this.ui.elements.messageTargetDevices.classList.remove('hidden');
      this.ui.renderTargetDevicesList('message', this.devices, this.peerId, this.selectedMessageTargets);
    } else {
      this.ui.elements.messageTargetDevices.classList.add('hidden');
      this.selectedMessageTargets.clear();
    }
  }

  connectToAllDevices() {
    const deviceIds = Object.keys(this.devices).filter(id => id !== this.peerId && id !== this.roomId);
    
    deviceIds.forEach(deviceId => {
      const hasConnection = this.connectionManager.connections.some(c => c.peer === deviceId && c.open);
      if (!hasConnection) {
        this.connectionManager.connectToDevice(deviceId);
      }
    });
  }

  sendNickname(conn = null) {
    const message = {
      type: 'nickname',
      nickname: this.nickname,
      from: this.peerId
    };

    if (conn) {
      conn.send(message);
    } else {
      this.broadcast(message);
    }
  }

  broadcast(data) {
    const openConnections = this.connectionManager.connections.filter(c => c.open);

    Object.keys(this.devices).forEach(deviceId => {
      if (deviceId !== this.peerId) {
        const conn = openConnections.find(c => c.peer === deviceId);
        if (conn) {
          try {
            conn.send(data);
          } catch (e) {
            console.warn('Failed to send to device:', deviceId, e);
          }
        } else {
          this.connectAndSend(deviceId, data);
        }
      }
    });
  }

  sendToTargets(targets, data) {
    if (targets.size === 0) {
      return false;
    }

    let sentCount = 0;
    targets.forEach(deviceId => {
      let conn = this.connectionManager.connections.find(c => c.peer === deviceId && c.open);

      if (conn) {
        try {
          conn.send(data);
          sentCount++;
        } catch (e) {
          console.warn('Failed to send to target:', deviceId, e);
        }
      } else {
        this.connectAndSend(deviceId, data);
      }
    });

    return sentCount > 0;
  }

  connectAndSend(deviceId, data) {
    if (this.connectionManager.peer && deviceId !== this.peerId) {
      const conn = this.connectionManager.connectToDevice(deviceId);
      if (conn) {
        conn.on('open', () => {
          conn.send(data);
        });
      }
    }
  }

  updateProgress(fileId, progress, bytes, status = null) {
    this.ui.updateProgress(fileId, progress, bytes, status);
  }

  addProgressItem(task) {
    this.ui.addProgressItem(task);
  }

  showToast(message, type = 'success') {
    this.ui.showToast(message, type);
  }

  addToHistory(type, name, size) {
    this.transferHistory.push({ type, name, size, time: Date.now() });
    this.ui.renderHistory(this.transferHistory);
  }

  addReceivedFile(name, size, blob) {
    this.receivedFiles.push({ name, size, time: Date.now() });
    this.receivedFileBlobs[name] = blob;
    this.ui.renderReceivedFiles(this.receivedFiles);
  }

  handleFileSelect(e) {
    const files = Array.from(e.target.files);
    this.addFilesToQueue(files);
  }

  handleFileDrop(files) {
    this.addFilesToQueue(Array.from(files));
  }

  addFilesToQueue(files) {
    files.forEach(file => {
      if (!this.filesToSend.find(f => f.name === file.name && f.size === file.size)) {
        this.filesToSend.push(file);
      }
    });
    this.ui.renderFileList(this.filesToSend);
    this.ui.elements.sendFilesBtn.classList.remove('hidden');
  }

  removeFile(index) {
    this.filesToSend.splice(index, 1);
    this.ui.renderFileList(this.filesToSend);
    if (this.filesToSend.length === 0) {
      this.ui.elements.sendFilesBtn.classList.add('hidden');
    }
  }

  sendFiles() {
    if (this.filesToSend.length === 0) {
      this.ui.showToast('请选择文件', 'error');
      return;
    }

    const openConnections = this.connectionManager.connections.filter(c => c.open);
    if (openConnections.length === 0) {
      this.ui.showToast('未连接', 'error');
      return;
    }

    const isSpecificTarget = this.ui.elements.fileTargetSpecific && this.ui.elements.fileTargetSpecific.checked;
    if (isSpecificTarget && this.selectedFileTargets.size === 0) {
      this.ui.showToast('请选择接收设备', 'error');
      return;
    }

    this.ui.clearProgressList();
    
    const targets = isSpecificTarget ? this.selectedFileTargets : null;

    this.filesToSend.forEach(file => {
      const task = this.fileTransfer.createSendTask(file, targets);
      this.fileTransfer.startSend(task.fileId);
    });

    this.filesToSend = [];
    this.ui.renderFileList(this.filesToSend);
    this.ui.elements.sendFilesBtn.classList.add('hidden');
  }

  clearProgress() {
    this.ui.clearProgressList();
  }

  sendMessage() {
    const message = this.ui.elements.messageInput.value.trim();
    if (!message) {
      this.ui.showToast('请输入内容', 'error');
      return;
    }

    const openConnections = this.connectionManager.connections.filter(c => c.open);
    if (openConnections.length === 0) {
      this.ui.showToast('未连接', 'error');
      return;
    }

    const isSpecificTarget = this.ui.elements.messageTargetSpecific && this.ui.elements.messageTargetSpecific.checked;
    if (isSpecificTarget && this.selectedMessageTargets.size === 0) {
      this.ui.showToast('请选择接收设备', 'error');
      return;
    }

    const messageData = {
      type: 'message',
      content: message,
      senderName: this.nickname || '我',
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    };

    if (isSpecificTarget) {
      this.sendToTargets(this.selectedMessageTargets, messageData);
    } else {
      this.broadcast(messageData);
    }

    this.addMessage(message, this.nickname || '我', 'sent', '刚刚');
    this.ui.elements.messageInput.value = '';
  }

  addMessage(content, sender, type, time) {
    const msgObj = { content, sender, type, time };
    this.messages.push(msgObj);
    this.ui.addMessage(msgObj);
  }

  handleData(data, conn) {
    if (data.type === 'heartbeat') {
      return;
    } else if (data.type === 'nickname') {
      this.pendingConnections.delete(conn.peer);

      const wasNewDevice = !this.devices[conn.peer];
      this.devices[conn.peer] = {
        id: conn.peer,
        nickname: data.nickname,
        joinedAt: this.devices[conn.peer]?.joinedAt || Date.now()
      };
      this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
      this.refreshTargetDeviceLists();

      const otherDevicesCount = Object.keys(this.devices).length - 1;
      if (otherDevicesCount > 0) {
        this.ui.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
      }

      if (wasNewDevice) {
        this.ui.showToast(`${data.nickname} 加入了房间`, 'success');
        if (this.isHost) {
          setTimeout(() => this.broadcastNewDevice(conn.peer, data.nickname), 500);
        }
      }
    } else if (data.type === 'request-devices') {
      if (this.isHost) {
        const devicesList = Object.keys(this.devices)
          .filter(id => id !== this.peerId && id !== data.from)
          .map(id => ({
            deviceId: id,
            nickname: this.devices[id]?.nickname || '匿名'
          }));
        conn.send({
          type: 'devices-list',
          devices: devicesList
        });
      }
    } else if (data.type === 'devices-list') {
      if (data.devices && Array.isArray(data.devices)) {
        data.devices.forEach(dev => {
          if (dev.deviceId !== this.peerId && !this.devices[dev.deviceId]) {
            this.devices[dev.deviceId] = {
              id: dev.deviceId,
              nickname: dev.nickname,
              joinedAt: Date.now()
            };
          }
        });
        this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
        this.refreshTargetDeviceLists();
        if (!this.isHost) {
          this.connectToAllDevices();
        }
      }
    } else if (data.type === 'new-device') {
      this.handleNewDevice(data);
    } else if (data.type === 'device-left') {
      if (this.devices[data.deviceId]) {
        delete this.devices[data.deviceId];
        this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
        this.refreshTargetDeviceLists();
        this.ui.showToast(`${data.nickname} 已离开`, 'success');
      }
      this.connectionManager.connections = this.connectionManager.connections.filter(c => c.peer !== data.deviceId);
      const otherDevicesCount = Object.keys(this.devices).length - 1;
      if (otherDevicesCount <= 0) {
        this.ui.updateConnectionStatus('waiting', '等待连接');
      }
    } else if (data.type === 'file-meta') {
      const task = this.fileTransfer.createReceiveTask(
        data.fileId,
        data.fileName,
        data.fileSize,
        data.totalChunks,
        data.senderName
      );
      this.ui.addProgressItem(task);
      this.ui.showToast(`接收文件: ${data.fileName}`, 'success');
    } else if (data.type === 'file-chunk') {
      this.fileTransfer.handleChunk(data.fileId, data.chunk, data.chunkIndex, data.totalChunks);
    } else if (data.type === 'file-complete') {
      this.fileTransfer.completeReceive(data.fileId);
    } else if (data.type === 'file-cancelled') {
      this.fileTransfer.cancelReceive(data.fileId);
      this.ui.showToast(`发送方取消了: ${data.fileName}`, 'error');
    } else if (data.type === 'message') {
      this.addMessage(data.content, data.senderName, 'received', data.time);
      
      this.notificationManager.show('收到新消息', {
        body: `${data.senderName}: ${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`
      });
    }
  }

  handleNewDevice(data) {
    if (!this.devices[data.deviceId]) {
      this.devices[data.deviceId] = {
        id: data.deviceId,
        nickname: data.nickname,
        joinedAt: Date.now()
      };
      this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
      this.refreshTargetDeviceLists();
      this.ui.showToast(`${data.nickname} 加入了房间`, 'success');
    }

    if (data.existingDevices && Array.isArray(data.existingDevices)) {
      data.existingDevices.forEach(dev => {
        if (!this.devices[dev.deviceId] && dev.deviceId !== this.peerId) {
          this.devices[dev.deviceId] = {
            id: dev.deviceId,
            nickname: dev.nickname,
            joinedAt: Date.now()
          };
        }
      });
      this.ui.renderDevicesList(this.devices, this.peerId, this.isHost);
      this.refreshTargetDeviceLists();
      this.connectToAllDevices();
    }
  }

  addReceivedFile(name, size, blob) {
    this.receivedFiles.push({ name, size, blob });
    this.receivedFileBlobs[name] = blob;
    this.ui.renderReceivedFiles(this.receivedFiles);
  }

  downloadFile(index) {
    const file = this.receivedFiles[index];
    if (!file) return;

    const blob = file.blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  addToHistory(type, name, size) {
    this.transferHistory.unshift({ type, name, size, time: Date.now() });
    if (this.transferHistory.length > 100) {
      this.transferHistory.pop();
    }
    this.ui.renderHistory(this.transferHistory);
  }
}

// 初始化应用
const app = new FileTransferApp();
