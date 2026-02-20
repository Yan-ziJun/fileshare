class FileTransferApp {
    constructor() {
        this.peer = null;
        this.connections = [];
        this.devices = {};
        this.pendingConnections = new Set();
        this.roomId = null;
        this.peerId = null;
        this.nickname = localStorage.getItem('nickname') || '匿名';
        this.filesToSend = [];
        this.receivedFiles = [];
        this.transferHistory = [];
        this.messages = [];
        this.fileChunks = {};
        this.CHUNK_SIZE = 64 * 1024;
        this.isHost = false;
        this.selectedFileTargets = new Set();
        this.selectedMessageTargets = new Set();

        this.initElements();
        this.initEventListeners();
        this.loadNickname();
    }

    initElements() {
        this.elements = {
            nicknameInput: document.getElementById('nicknameInput'),
            createRoomBtn: document.getElementById('createRoomBtn'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),

            disconnectBtn: document.getElementById('disconnectBtn'),
            confirmJoinBtn: document.getElementById('confirmJoinBtn'),
            roomDisplay: document.getElementById('roomDisplay'),
            roomId: document.getElementById('roomId'),
            connectionStatus: document.getElementById('connectionStatus'),
            joinForm: document.getElementById('joinForm'),
            roomIdInput: document.getElementById('roomIdInput'),
            devicesList: document.getElementById('devicesList'),
            devicesListContent: document.getElementById('devicesListContent'),
            peerNickname: document.getElementById('peerNickname'),
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
            transferHistory: document.getElementById('transferHistory'),
            toast: document.getElementById('toast')
        };
    }

    initEventListeners() {
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.showJoinForm());
        this.elements.confirmJoinBtn.addEventListener('click', () => this.joinRoom());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.elements.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        this.elements.roomIdInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.elements.sendFilesBtn.addEventListener('click', () => this.sendFiles());
        this.elements.clearProgressBtn.addEventListener('click', () => this.clearProgress());
        this.elements.sendMessageBtn.addEventListener('click', () => this.sendMessage());

        if (this.elements.fileTargetRoom) {
            this.elements.fileTargetRoom.addEventListener('change', () => {
                this.onFileTargetChange();
            });
        }
        if (this.elements.fileTargetSpecific) {
            this.elements.fileTargetSpecific.addEventListener('change', () => {
                this.onFileTargetChange();
            });
        }
        if (this.elements.messageTargetRoom) {
            this.elements.messageTargetRoom.addEventListener('change', () => {
                this.onMessageTargetChange();
            });
        }
        if (this.elements.messageTargetSpecific) {
            this.elements.messageTargetSpecific.addEventListener('change', () => {
                this.onMessageTargetChange();
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
                this.handleFileDrop(e.dataTransfer.files);
            }
        });

        this.elements.nicknameInput.addEventListener('input', (e) => {
            this.nickname = e.target.value.trim();
            localStorage.setItem('nickname', this.nickname);
        });

        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.querySelectorAll('.panel-header').forEach(header => {
            header.addEventListener('click', () => {
                const panel = header.parentElement;
                panel.classList.toggle('expanded');
            });
        });

        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.add('expanded');
        });

        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.switchTab('settings');
            });
        }
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

    loadNickname() {
        if (this.nickname) {
            this.elements.nicknameInput.value = this.nickname;
        }
    }

    onFileTargetChange() {
        if (this.elements.fileTargetSpecific && this.elements.fileTargetSpecific.checked) {
            this.elements.fileTargetDevices.classList.remove('hidden');
            this.renderTargetDevicesList('file');
        } else {
            this.elements.fileTargetDevices.classList.add('hidden');
            this.selectedFileTargets.clear();
        }
    }

    onMessageTargetChange() {
        if (this.elements.messageTargetSpecific && this.elements.messageTargetSpecific.checked) {
            this.elements.messageTargetDevices.classList.remove('hidden');
            this.renderTargetDevicesList('message');
        } else {
            this.elements.messageTargetDevices.classList.add('hidden');
            this.selectedMessageTargets.clear();
        }
    }

    renderTargetDevicesList(type) {
        const deviceList = type === 'file' ? this.elements.fileTargetDevicesList : this.elements.messageTargetDevicesList;
        const selectedTargets = type === 'file' ? this.selectedFileTargets : this.selectedMessageTargets;

        const deviceIds = Object.keys(this.devices).filter(id => id !== this.peerId);

        if (deviceIds.length === 0) {
            deviceList.innerHTML = '<div class="empty-tip">暂无可选择的设备</div>';
            return;
        }

        const icons = ['💻', '📱', '📱', '📱', '📱', '💻', '📱', '💻'];

        deviceList.innerHTML = deviceIds.map((id, index) => {
            const device = this.devices[id];
            const icon = device.nickname.includes('手机') ? '📱' :
                         device.nickname.includes('电脑') ? '💻' :
                         icons[index % icons.length];
            const isSelected = selectedTargets.has(id);

            return `
                <div class="target-device-item ${isSelected ? 'selected' : ''}" data-device-id="${id}">
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
                if (selectedTargets.has(deviceId)) {
                    selectedTargets.delete(deviceId);
                    item.classList.remove('selected');
                    item.querySelector('input').checked = false;
                } else {
                    selectedTargets.add(deviceId);
                    item.classList.add('selected');
                    item.querySelector('input').checked = true;
                }
            });
        });
    }

    generateRoomId() {
        const num = Math.floor(1000 + Math.random() * 9000);
        return 'yan' + num;
    }

    createRoom() {
        this.roomId = this.generateRoomId();
        this.isHost = true;
        this.elements.roomId.textContent = this.roomId;
        this.elements.roomDisplay.classList.add('show');
        this.elements.createRoomBtn.classList.add('hidden');
        this.elements.joinRoomBtn.classList.add('hidden');
        this.elements.disconnectBtn.classList.remove('hidden');

        this.updateConnectionStatus('waiting', '等待连接');
        this.initPeer(this.roomId);
    }

    showJoinForm() {
        this.elements.joinForm.classList.toggle('show');
        this.elements.joinRoomBtn.classList.add('hidden');
    }

    joinRoom() {
        const inputRoomId = this.elements.roomIdInput.value.trim();
        if (!inputRoomId) {
            this.showToast('请输入房间号后4位', 'error');
            return;
        }

        this.roomId = 'yan' + inputRoomId;
        this.isHost = false;
        this.elements.roomId.textContent = this.roomId;
        this.elements.roomDisplay.classList.add('show');
        this.elements.joinForm.classList.remove('show');
        this.elements.createRoomBtn.classList.add('hidden');
        this.elements.joinRoomBtn.classList.add('hidden');
        this.elements.disconnectBtn.classList.remove('hidden');

        this.updateConnectionStatus('waiting', '正在连接...');
        this.initPeer();
    }

    addMyDevice() {
        this.devices[this.peerId] = {
            id: this.peerId,
            nickname: this.nickname,
            joinedAt: Date.now()
        };
        this.renderDevicesList();
    }

    disconnect() {
        if (!this.roomId) {
            return;
        }

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

        this.roomId = null;
        this.isHost = false;
        this.devices = {};

        this.elements.roomId.textContent = '------';
        this.elements.roomDisplay.classList.remove('show');
        this.elements.createRoomBtn.classList.remove('hidden');
        this.elements.joinRoomBtn.classList.remove('hidden');
        this.elements.disconnectBtn.classList.add('hidden');
        this.elements.joinForm.classList.remove('show');

        this.renderDevicesList();
        this.updateConnectionStatus('waiting', '等待连接');
        this.showToast('已断开连接', 'success');
    }

    addDevice(deviceId, nickname) {
        this.devices[deviceId] = {
            id: deviceId,
            nickname: nickname,
            joinedAt: Date.now()
        };
        this.renderDevicesList();
        this.refreshTargetDeviceLists();

        const otherDevicesCount = Object.keys(this.devices).length - 1;
        if (otherDevicesCount > 0) {
            this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
        }

        if (this.isHost) {
            this.broadcastNewDevice(deviceId, nickname);
        }

        this.showToast(`${nickname} 加入了房间`, 'success');
    }

    broadcastNewDeviceImmediate(deviceId, nickname) {
        const notifyMessage = {
            type: 'new-device',
            deviceId: deviceId,
            nickname: nickname,
            existingDevices: []
        };

        this.connections.forEach(conn => {
            if (conn.open && conn.peer !== deviceId) {
                conn.send(notifyMessage);
            }
        });
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

        this.connections.forEach(conn => {
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
            this.renderDevicesList();
            this.refreshTargetDeviceLists();
            this.showToast(`${nickname} 已离开`, 'success');
            
            if (this.isHost) {
                this.broadcast({
                    type: 'device-left',
                    deviceId: deviceId,
                    nickname: nickname
                });
            }
        }

        this.connections = this.connections.filter(c => c.peer !== deviceId);

        const otherDevicesCount = Object.keys(this.devices).length - 1;
        if (otherDevicesCount <= 0) {
            this.updateConnectionStatus('waiting', '等待连接');
        } else {
            this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
        }
    }

    refreshTargetDeviceLists() {
        const isFileTargetExpanded = this.elements.fileTargetSpecific && this.elements.fileTargetSpecific.checked;
        const isMessageTargetExpanded = this.elements.messageTargetSpecific && this.elements.messageTargetSpecific.checked;

        if (isFileTargetExpanded) {
            this.renderTargetDevicesList('file');
        }
        if (isMessageTargetExpanded) {
            this.renderTargetDevicesList('message');
        }
    }

    renderDevicesList() {
        let deviceIds = Object.keys(this.devices).filter(id => id !== this.peerId);
        
        if (this.isHost) {
            deviceIds = deviceIds.filter(id => id !== this.roomId);
        }
        
        if (deviceIds.length === 0) {
            this.elements.devicesList.classList.add('hidden');
            return;
        }

        this.elements.devicesList.classList.remove('hidden');

        const icons = ['💻', '📱', '📱', '📱', '📱', '💻', '📱', '💻'];
        
        this.elements.devicesListContent.innerHTML = deviceIds.map((id, index) => {
            const device = this.devices[id];
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

    initPeer(customId = null) {
        if (this.peer) {
            this.peer.destroy();
        }

        const peerConfig = {
            debug: 1
        };

        if (customId) {
            peerConfig.id = customId;
        }

        this.peer = new Peer(customId, peerConfig);

        this.peer.on('open', (id) => {
            this.peerId = id;

            if (this.isHost) {
                this.devices[this.peerId] = {
                    id: this.peerId,
                    nickname: this.nickname,
                    joinedAt: Date.now()
                };
                this.renderDevicesList();
                this.updateConnectionStatus('waiting', '等待连接');
                this.showToast('房间创建成功', 'success');
            } else {
                this.devices[this.peerId] = {
                    id: this.peerId,
                    nickname: this.nickname,
                    joinedAt: Date.now()
                };
                this.renderDevicesList();
                setTimeout(() => this.connectToRoom(this.roomId), 500);
            }
        });

        this.peer.on('connection', (conn) => {
            this.handleNewConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (err.type === 'unavailable-id') {
                this.showToast('房间号已被占用', 'error');
                this.updateConnectionStatus('error', '房间号无效');
            } else if (err.type === 'peer-unavailable') {
                this.showToast('房间不存在', 'error');
                this.updateConnectionStatus('error', '连接失败');
            } else {
                this.showToast('连接错误', 'error');
            }
        });

        this.peer.on('disconnected', () => {
            this.updateConnectionStatus('waiting', '连接已断开');
            this.stopHeartbeat();
        });

        this.heartbeatInterval = null;
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            const openConnections = this.connections.filter(c => c.open);
            openConnections.forEach(conn => {
                if (conn.peer !== this.peerId) {
                    conn.send({ type: 'heartbeat', time: Date.now() });
                }
            });
        }, 10000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    connectToRoom(roomId) {
        const conn = this.peer.connect(roomId, {
            reliable: true,
            metadata: { nickname: this.nickname }
        });

        conn.on('open', () => {
            this.handleNewConnection(conn);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.showToast('连接失败', 'error');
        });
    }

    handleNewConnection(conn) {
        this.connections.push(conn);

        conn.on('open', () => {
            this.pendingConnections.add(conn.peer);

            if (!this.isHost && this.roomId && conn.peer === this.roomId) {
                this.devices[this.roomId] = {
                    id: this.roomId,
                    nickname: '房主',
                    joinedAt: Date.now()
                };
                this.renderDevicesList();
                const otherDevicesCount = Object.keys(this.devices).length - 1;
                if (otherDevicesCount > 0) {
                    this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
                } else {
                    this.updateConnectionStatus('connected', '已连接');
                }
                this.connectToAllDevices();
                setTimeout(() => {
                    conn.send({ type: 'request-devices', from: this.peerId });
                }, 300);
            }

            if (this.isHost && conn.peer !== this.peerId) {
                const nicknameFromMeta = conn.metadata?.nickname || '匿名';
                if (!this.devices[conn.peer]) {
                    this.devices[conn.peer] = {
                        id: conn.peer,
                        nickname: nicknameFromMeta,
                        joinedAt: Date.now()
                    };
                    this.renderDevicesList();
                    this.broadcastNewDeviceImmediate(conn.peer, nicknameFromMeta);
                }
                const otherDevicesCount = Object.keys(this.devices).length - 1;
                if (otherDevicesCount > 0) {
                    this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
                }
            }

            this.sendNickname(conn);
            this.startHeartbeat();

            setTimeout(() => {
                if (this.pendingConnections.has(conn.peer)) {
                    this.pendingConnections.delete(conn.peer);
                    if (!this.devices[conn.peer]) {
                        this.connections = this.connections.filter(c => c.peer !== conn.peer);
                    }
                }
            }, 10000);
        });

        conn.on('data', (data) => {
            if (data.type === 'nickname') {
                this.pendingConnections.delete(conn.peer);

                const wasNewDevice = !this.devices[conn.peer];
                this.devices[conn.peer] = {
                    id: conn.peer,
                    nickname: data.nickname,
                    joinedAt: this.devices[conn.peer]?.joinedAt || Date.now()
                };
                this.renderDevicesList();
                this.refreshTargetDeviceLists();

                const otherDevicesCount = Object.keys(this.devices).length - 1;
                if (otherDevicesCount > 0) {
                    this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
                }

                if (wasNewDevice) {
                    this.showToast(`${data.nickname} 加入了房间`, 'success');
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
            } else if (data.type === 'new-device') {
                this.handleNewDevice(data);
            } else {
                this.handleData(data, conn);
            }
        });

        conn.on('close', () => {
            this.pendingConnections.delete(conn.peer);
            this.removeDevice(conn.peer);
            const openConnections = this.connections.filter(c => c.open && c.peer !== conn.peer);
            if (openConnections.length === 0) {
                this.stopHeartbeat();
                this.updateConnectionStatus('disconnected', '连接断开');
            }
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
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
        const openConnections = this.connections.filter(c => c.open);

        Object.keys(this.devices).forEach(deviceId => {
            if (deviceId !== this.peerId) {
                const conn = openConnections.find(c => c.peer === deviceId);
                if (conn) {
                    conn.send(data);
                } else {
                    this.connectAndSend(deviceId, data);
                }
            }
        });
    }

    broadcastExcept(excludePeerId, data) {
        this.connections.forEach(conn => {
            if (conn.open && conn.peer !== excludePeerId) {
                conn.send(data);
            }
        });
    }

    sendToTargets(targets, data) {
        if (targets.size === 0) {
            return false;
        }

        let sentCount = 0;
        targets.forEach(deviceId => {
            let conn = this.connections.find(c => c.peer === deviceId && c.open);

            if (conn) {
                conn.send(data);
                sentCount++;
            } else {
                this.connectAndSend(deviceId, data);
            }
        });

        return sentCount > 0;
    }

    connectAndSend(deviceId, data) {
        if (this.peer && deviceId !== this.peerId) {
            const conn = this.peer.connect(deviceId, {
                reliable: true,
                metadata: { nickname: this.nickname }
            });

            this.connections.push(conn);

            conn.on('open', () => {
                conn.send(data);
                this.showToast('连接已建立', 'success');
            });

            conn.on('error', (err) => {
                console.error('连接错误:', err);
            });
        }
    }

    onPeerConnected(deviceId) {
        const otherDevicesCount = Object.keys(this.devices).length - 1;
        if (otherDevicesCount > 0) {
            this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
        }
    }

    updateConnectionStatus(status, message) {
        this.elements.connectionStatus.textContent = message;
        this.elements.connectionStatus.className = 'status ' + status;
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
        this.renderFileList();
        this.elements.sendFilesBtn.classList.remove('hidden');
    }

    renderFileList() {
        this.elements.fileList.innerHTML = this.filesToSend.map((file, index) => `
            <div class="file-item" data-index="${index}">
                <div class="file-info">
                    <span class="file-icon">${this.getFileIcon(file.name)}</span>
                    <div class="file-details">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                    </div>
                </div>
                <button class="file-remove">×</button>
            </div>
        `).join('');

        this.initFileListEvents();
    }

    initFileListEvents() {
        this.elements.fileList.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.file-remove');
            if (removeBtn) {
                const fileItem = removeBtn.closest('.file-item');
                const index = parseInt(fileItem.dataset.index, 10);
                if (!isNaN(index) && index >= 0 && index < this.filesToSend.length) {
                    this.removeFile(index);
                }
            }
        });
    }

    removeFile(index) {
        this.filesToSend.splice(index, 1);
        this.renderFileList();
        if (this.filesToSend.length === 0) {
            this.elements.sendFilesBtn.classList.add('hidden');
        }
    }

    sendFiles() {
        if (this.filesToSend.length === 0) {
            this.showToast('请选择文件', 'error');
            return;
        }

        if (this.connections.length === 0 || !this.connections.some(c => c.open)) {
            this.showToast('未连接', 'error');
            return;
        }

        const isSpecificTarget = this.elements.fileTargetSpecific && this.elements.fileTargetSpecific.checked;
        if (isSpecificTarget && this.selectedFileTargets.size === 0) {
            this.showToast('请选择接收设备', 'error');
            return;
        }

        this.elements.progressList.innerHTML = '';
        this.fileChunks = {};

        this.filesToSend.forEach(file => {
            this.sendFile(file, isSpecificTarget ? this.selectedFileTargets : null);
        });

        this.filesToSend = [];
        this.renderFileList();
    }

    sendFile(file, targets = null) {
        const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const fileSize = file.size;
        const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
        const sendMethod = targets ? (data) => this.sendToTargets(targets, data) : (data) => this.broadcast(data);

        sendMethod({
            type: 'file-meta',
            fileId: fileId,
            fileName: file.name,
            fileSize: fileSize,
            totalChunks: totalChunks,
            senderName: this.nickname || '匿名'
        });

        this.addProgressItem(fileId, file.name, fileSize);

        let currentChunk = 0;
        let lastProgressTime = Date.now();

        const sendNext = () => {
            if (this.fileChunks[fileId] && this.fileChunks[fileId].cancelled) {
                sendMethod({
                    type: 'file-cancelled',
                    fileId: fileId,
                    fileName: file.name
                });
                
                const progressItem = document.getElementById('progress-item-' + fileId);
                if (progressItem) {
                    progressItem.remove();
                }
                delete this.fileChunks[fileId];
                this.showToast('已取消发送', 'error');
                return;
            }

            if (currentChunk >= totalChunks) {
                sendMethod({
                    type: 'file-complete',
                    fileId: fileId,
                    fileSize: fileSize
                });

                this.updateProgress(fileId, 100, fileSize, '已完成');
                this.addToHistory('sent', file.name, fileSize);
                this.showToast(`已发送: ${file.name}`, 'success');
                return;
            }

            const start = currentChunk * this.CHUNK_SIZE;
            const end = Math.min(start + this.CHUNK_SIZE, fileSize);
            const chunkData = file.slice(start, end);

            if (chunkData.size === 0) {
                currentChunk = totalChunks;
                sendMethod({
                    type: 'file-complete',
                    fileId: fileId,
                    fileSize: fileSize
                });
                return;
            }

            sendMethod({
                type: 'file-chunk',
                fileId: fileId,
                chunk: chunkData,
                chunkIndex: currentChunk,
                totalChunks: totalChunks
            });

            currentChunk++;

            const now = Date.now();
            if (now - lastProgressTime >= 100) {
                const progress = Math.round((currentChunk / totalChunks) * 100);
                const bytesSent = Math.min(currentChunk * this.CHUNK_SIZE, fileSize);
                this.updateProgress(fileId, progress, bytesSent);
                lastProgressTime = now;
            }

            if (currentChunk < totalChunks) {
                setTimeout(sendNext, 5);
            } else {
                sendMethod({
                    type: 'file-complete',
                    fileId: fileId,
                    fileSize: fileSize
                });

                this.updateProgress(fileId, 100, fileSize, '已完成');
                this.addToHistory('sent', file.name, fileSize);
                this.showToast(`已发送: ${file.name}`, 'success');
            }
        };

        setTimeout(sendNext, 50);
    }

    sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message) {
            this.showToast('请输入内容', 'error');
            return;
        }

        if (this.connections.length === 0 || !this.connections.some(c => c.open)) {
            this.showToast('未连接', 'error');
            return;
        }

        const isSpecificTarget = this.elements.messageTargetSpecific && this.elements.messageTargetSpecific.checked;
        if (isSpecificTarget && this.selectedMessageTargets.size === 0) {
            this.showToast('请选择接收设备', 'error');
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
        this.elements.messageInput.value = '';
    }

    addMessage(content, sender, type, time) {
        const msgObj = { content, sender, type, time };
        this.messages.push(msgObj);
        this.renderMessages();
        this.scrollToBottom();
    }

    scrollToBottom() {
        const messagesList = this.elements.messagesList;
        messagesList.scrollTop = messagesList.scrollHeight;
    }

    renderMessages() {
        if (this.messages.length === 0) {
            this.elements.messagesList.innerHTML = '<p class="empty-tip">暂无消息</p>';
            return;
        }

        this.elements.messagesList.innerHTML = this.messages.map(msg => `
            <div class="message-item ${msg.type}">
                <div class="message-sender">${msg.sender} · ${msg.time}</div>
                <div class="message-content">${this.escapeHtml(msg.content)}</div>
            </div>
        `).join('');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    handleData(data, conn = null) {
        if (data.type === 'heartbeat') {
            return;
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
                this.renderDevicesList();
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
                this.renderDevicesList();
                this.refreshTargetDeviceLists();
                this.showToast(`${data.nickname} 已离开`, 'success');
            }
            this.connections = this.connections.filter(c => c.peer !== data.deviceId);
            const otherDevicesCount = Object.keys(this.devices).length - 1;
            if (otherDevicesCount <= 0) {
                this.updateConnectionStatus('waiting', '等待连接');
            } else {
                this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
            }
        } else if (data.type === 'file-meta') {
            this.receiveFileMeta(data);
        } else if (data.type === 'file-chunk') {
            this.receiveFileChunk(data);
        } else if (data.type === 'file-complete') {
            this.completeFileReceive(data);
        } else if (data.type === 'file-cancelled') {
            this.handleFileCancelled(data);
        } else if (data.type === 'message') {
            this.receiveMessage(data);
        }
    }

    handleNewDevice(data) {
        const { deviceId, nickname, existingDevices } = data;

        if (deviceId === this.peerId) return;

        if (!this.devices[deviceId]) {
            this.devices[deviceId] = {
                id: deviceId,
                nickname: nickname,
                joinedAt: Date.now()
            };
            this.renderDevicesList();
            this.refreshTargetDeviceLists();
        }

        if (existingDevices && Array.isArray(existingDevices)) {
            existingDevices.forEach(dev => {
                if (dev.deviceId !== this.peerId && !this.devices[dev.deviceId]) {
                    this.devices[dev.deviceId] = {
                        id: dev.deviceId,
                        nickname: dev.nickname,
                        joinedAt: Date.now()
                    };
                }
            });
            this.renderDevicesList();
            this.refreshTargetDeviceLists();
        }

        if (!this.isHost) {
            this.connectToAllDevices();
        }
    }

    connectToDevice(deviceId) {
        if (this.peer && deviceId !== this.peerId) {
            const conn = this.peer.connect(deviceId, {
                reliable: true,
                metadata: { nickname: this.nickname }
            });

            this.connections.push(conn);

            conn.on('open', () => {
                this.sendNickname(conn);
                if (!this.isHost) {
                    this.connectToAllDevices();
                }
            });

            conn.on('data', (data) => {
                if (data.type === 'nickname') {
                    this.pendingConnections.delete(conn.peer);
                    const isNewDevice = !this.devices[conn.peer];
                    this.devices[conn.peer] = {
                        id: conn.peer,
                        nickname: data.nickname,
                        joinedAt: this.devices[conn.peer]?.joinedAt || Date.now()
                    };
                    if (isNewDevice) {
                        this.onPeerConnected(conn.peer);
                        this.renderDevicesList();
                        this.refreshTargetDeviceLists();
                        const otherDevicesCount = Object.keys(this.devices).length - 1;
                        if (otherDevicesCount > 0) {
                            this.updateConnectionStatus('connected', `${otherDevicesCount} 个设备已连接`);
                        }
                        this.showToast(`${data.nickname} 加入了房间`, 'success');
                    } else {
                        this.renderDevicesList();
                    }
                } else if (data.type === 'new-device') {
                    this.handleNewDevice(data);
                } else {
                    this.handleData(data, conn);
                }
            });

            conn.on('close', () => {
                this.pendingConnections.delete(conn.peer);
                this.removeDevice(conn.peer);
                const openConnections = this.connections.filter(c => c.open && c.peer !== conn.peer);
                if (openConnections.length === 0) {
                    this.stopHeartbeat();
                    this.updateConnectionStatus('disconnected', '连接断开');
                }
            });

            conn.on('error', (err) => {
                console.error('Connection error:', err);
            });
        }
    }

    connectToAllDevices() {
        Object.keys(this.devices).forEach(deviceId => {
            if (deviceId !== this.peerId) {
                if (!this.connections.some(c => c.peer === deviceId && c.open)) {
                    this.connectToDevice(deviceId);
                }
            }
        });
    }

    receiveFileMeta(data) {
        const { fileId, fileName, fileSize, totalChunks, senderName } = data;

        if (this.fileChunks[fileId]) {
            return;
        }

        this.fileChunks[fileId] = {
            fileName: fileName,
            fileSize: fileSize,
            totalChunks: totalChunks,
            chunks: {},
            receivedChunks: 0,
            autoStart: true,
            cancelled: false
        };

        this.addProgressItem(fileId, fileName, fileSize);
        this.showToast(`收到文件: ${fileName}`, 'success');
    }

    receiveFileChunk(data) {
        const { fileId, chunk, chunkIndex, totalChunks } = data;

        if (!this.fileChunks[fileId]) {
            return;
        }

        const fileData = this.fileChunks[fileId];

        if (fileData.chunks[chunkIndex]) {
            return;
        }

        fileData.chunks[chunkIndex] = chunk;
        fileData.receivedChunks++;

        const progress = Math.round((fileData.receivedChunks / totalChunks) * 100);
        const bytesReceived = Math.min(fileData.receivedChunks * this.CHUNK_SIZE, fileData.fileSize);

        this.updateProgress(fileId, progress, bytesReceived);
    }

    receiveMessage(data) {
        const { content, senderName, time } = data;
        this.peerNickname = senderName;
        if (this.elements.peerNickname) {
            this.elements.peerNickname.textContent = senderName;
        }
        this.addMessage(content, senderName, 'received', time);
    }

    completeFileReceive(data) {
        const fileId = data.fileId;
        const fileSize = data.fileSize;
        const fileData = this.fileChunks[fileId];

        if (!fileData) return;

        fileData.fileSize = fileSize;

        setTimeout(() => {
            const totalChunks = fileData.totalChunks || Math.ceil(fileSize / this.CHUNK_SIZE);

            if (fileData.receivedChunks >= totalChunks) {
                this.processReceivedChunk(fileId, 0);
            } else {
                setTimeout(() => {
                    this.processReceivedChunk(fileId, 0);
                }, 200);
            }
        }, 300);
    }

    handleFileCancelled(data) {
        const { fileId, fileName } = data;
        
        if (this.fileChunks[fileId]) {
            const progressItem = document.getElementById('progress-item-' + fileId);
            if (progressItem) {
                progressItem.remove();
            }
            delete this.fileChunks[fileId];
        }
        
        this.showToast(`${fileName} 已取消发送`, 'error');
    }

    processReceivedChunk(fileId, chunkIndex) {
        const fileData = this.fileChunks[fileId];
        if (!fileData) return;

        const totalChunks = Math.ceil(fileData.fileSize / this.CHUNK_SIZE);
        const chunks = [];

        for (let i = 0; i < totalChunks; i++) {
            if (fileData.chunks[i]) {
                chunks.push(fileData.chunks[i]);
            } else {
                return;
            }
        }

        const blob = new Blob(chunks, { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileData.fileName;
        link.click();

        URL.revokeObjectURL(url);

        this.updateProgress(fileId, 100, fileData.fileSize, '已下载');
        this.addToHistory('received', fileData.fileName, fileData.fileSize);
        this.showToast(`已下载: ${fileData.fileName}`, 'success');

        delete this.fileChunks[fileId];
    }

    addProgressItem(fileId, fileName, fileSize) {
        document.querySelector('.progress-section').classList.remove('hidden');

        const progressItem = document.createElement('div');
        progressItem.className = 'progress-item';
        progressItem.id = 'progress-item-' + fileId;
        progressItem.innerHTML = `
            <div class="progress-header">
                <span class="progress-name" title="${fileName}">${fileName}</span>
                <span class="progress-status" id="progress-status-${fileId}">0%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" id="progress-bar-${fileId}" style="width: 0%"></div>
            </div>
            <div class="progress-details">
                <div>
                    <span id="progress-current-${fileId}">0 KB</span>
                    <span id="progress-total-${fileId}"> / ${this.formatFileSize(fileSize)}</span>
                </div>
                <div class="progress-info">
                    <span id="progress-speed-${fileId}" class="progress-speed"></span>
                    <span id="progress-time-${fileId}" class="progress-time"></span>
                </div>
            </div>
            <button class="btn-cancel" onclick="app.cancelFile('${fileId}')">取消</button>
        `;
        this.elements.progressList.appendChild(progressItem);

        this.fileChunks[fileId] = {
            ...(this.fileChunks[fileId] || {}),
            startTime: Date.now(),
            lastBytes: 0,
            fileSize: fileSize,
            cancelled: false
        };
    }

    cancelFile(fileId) {
        if (this.fileChunks[fileId]) {
            this.fileChunks[fileId].cancelled = true;
        }
    }

    clearProgress() {
        this.elements.progressList.innerHTML = '';
        this.elements.progressList.parentElement.classList.add('hidden');
        this.fileChunks = {};
    }

    updateProgress(fileId, percentage, currentSize, status = null) {
        if (this.fileChunks[fileId] && this.fileChunks[fileId].cancelled) {
            return;
        }

        const progressBar = document.getElementById('progress-bar-' + fileId);
        const progressStatus = document.getElementById('progress-status-' + fileId);
        const progressCurrent = document.getElementById('progress-current-' + fileId);
        const progressSpeed = document.getElementById('progress-speed-' + fileId);
        const progressTime = document.getElementById('progress-time-' + fileId);

        if (progressBar) {
            progressBar.style.width = percentage + '%';
        }
        if (progressStatus) {
            progressStatus.textContent = status || percentage + '%';
        }
        if (progressCurrent) {
            progressCurrent.textContent = this.formatFileSize(currentSize);
        }

        const fileData = this.fileChunks[fileId];
        if (fileData && progressSpeed && progressTime) {
            const elapsed = (Date.now() - fileData.startTime) / 1000;
            const bytesDiff = currentSize - fileData.lastBytes;

            if (elapsed > 1 && bytesDiff > 0) {
                const speed = Math.round(bytesDiff / elapsed);
                progressSpeed.textContent = `${this.formatFileSize(speed)}/s`;

                const remainingBytes = fileData.fileSize - currentSize;
                const remainingTime = Math.round(remainingBytes / speed);
                progressTime.textContent = `约剩${this.formatTime(remainingTime)}`;
            }

            fileData.lastBytes = currentSize;
        }
    }

    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}秒`;
        } else if (seconds < 3600) {
            return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
        } else {
            return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`;
        }
    }

    addToHistory(type, fileName, fileSize) {
        const historyItem = {
            type: type,
            fileName: fileName,
            fileSize: fileSize,
            time: new Date().toLocaleString('zh-CN')
        };

        this.transferHistory.unshift(historyItem);
        if (this.transferHistory.length > 20) {
            this.transferHistory.pop();
        }

        this.renderHistory();
    }

    renderHistory() {
        if (this.transferHistory.length === 0) {
            this.elements.transferHistory.innerHTML = '<div class="empty-tip">暂无记录</div>';
            return;
        }

        this.elements.transferHistory.innerHTML = this.transferHistory.map(item => `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-type ${item.type}">${item.type === 'sent' ? '发送' : '接收'}</span>
                    <span class="history-name" title="${item.fileName}">${item.fileName}</span>
                </div>
                <span class="history-size">${this.formatFileSize(item.fileSize)}</span>
            </div>
        `).join('');
    }

    getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const icons = {
            pdf: '📕', doc: '📘', docx: '📘',
            xls: '📗', xlsx: '📗',
            ppt: '📙', pptx: '📙',
            jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
            mp3: '🎵', wav: '🎵', ogg: '🎵', m4a: '🎵',
            mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬', webm: '🎬',
            zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
            js: '📜', ts: '📜', py: '📜', java: '📜', c: '📜', cpp: '📜',
            html: '🌐', css: '🌐',
            json: '📋', xml: '📋',
            txt: '📄', md: '📄'
        };
        return icons[ext] || '📁';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    showToast(message, type = '') {
        this.elements.toast.textContent = message;
        this.elements.toast.className = 'toast ' + type;
        this.elements.toast.classList.remove('hidden');

        requestAnimationFrame(() => {
            this.elements.toast.classList.add('show');
        });

        setTimeout(() => {
            this.elements.toast.classList.remove('show');
            setTimeout(() => {
                this.elements.toast.classList.add('hidden');
            }, 400);
        }, 2800);
    }
}

const app = new FileTransferApp();
