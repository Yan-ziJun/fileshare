class FileTransferApp {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.roomId = null;
        this.peerId = null;
        this.filesToSend = [];
        this.receivedFiles = [];
        this.transferHistory = [];
        this.fileChunks = {};
        this.CHUNK_SIZE = 16 * 1024;

        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        this.elements = {
            createRoomBtn: document.getElementById('createRoomBtn'),
            joinRoomBtn: document.getElementById('joinRoomBtn'),
            roomInfo: document.getElementById('roomInfo'),
            roomId: document.getElementById('roomId'),
            copyRoomId: document.getElementById('copyRoomId'),
            connectionStatus: document.getElementById('connectionStatus'),
            joinForm: document.getElementById('joinForm'),
            roomIdInput: document.getElementById('roomIdInput'),
            confirmJoin: document.getElementById('confirmJoin'),
            peerInfo: document.getElementById('peerInfo'),
            transferPanel: document.getElementById('transferPanel'),
            receivePanel: document.getElementById('receivePanel'),
            fileInput: document.getElementById('fileInput'),
            fileList: document.getElementById('fileList'),
            sendFilesBtn: document.getElementById('sendFilesBtn'),
            incomingFiles: document.getElementById('incomingFiles'),
            progressList: document.getElementById('progressList'),
            transferHistory: document.getElementById('transferHistory'),
            clearHistory: document.getElementById('clearHistory'),
            toast: document.getElementById('toast')
        };
    }

    initEventListeners() {
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.showJoinForm());
        this.elements.copyRoomId.addEventListener('click', () => this.copyRoomId());
        this.elements.confirmJoin.addEventListener('click', () => this.joinRoom());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.elements.sendFilesBtn.addEventListener('click', () => this.sendFiles());
        this.elements.clearHistory.addEventListener('click', () => this.clearHistory());

        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files.length > 0) {
                this.handleFileDrop(e.dataTransfer.files);
            }
        });

        this.elements.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });
    }

    generateRoomId() {
        return 'ft-' + Math.random().toString(36).substr(2, 9);
    }

    createRoom() {
        this.roomId = this.generateRoomId();
        this.elements.roomId.textContent = this.roomId;
        this.elements.roomInfo.classList.remove('hidden');
        this.elements.createRoomBtn.classList.add('hidden');
        this.elements.joinRoomBtn.classList.add('hidden');

        this.initPeer(this.roomId);
        this.showToast('房间创建成功！等待对方加入...', 'success');
    }

    showJoinForm() {
        this.elements.joinForm.classList.toggle('hidden');
        this.elements.joinRoomBtn.classList.add('hidden');
    }

    joinRoom() {
        const inputRoomId = this.elements.roomIdInput.value.trim();
        if (!inputRoomId) {
            this.showToast('请输入房间ID', 'error');
            return;
        }

        this.roomId = inputRoomId;
        this.elements.roomInfo.classList.remove('hidden');
        this.elements.roomId.textContent = this.roomId;
        this.elements.joinForm.classList.add('hidden');

        this.initPeer();
        this.showToast('正在连接房间...', 'success');
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
            console.log('Peer ID:', id);
            this.updateConnectionStatus('waiting', '等待连接...');

            if (!customId) {
                setTimeout(() => this.connectToRoom(this.roomId), 500);
            }
        });

        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (err.type === 'unavailable-id') {
                this.showToast('房间ID已被占用，请刷新重试', 'error');
            } else if (err.type === 'peer-unavailable') {
                this.showToast('房间不存在或对方已断开', 'error');
                this.updateConnectionStatus('error', '连接失败');
            } else {
                this.showToast('连接错误: ' + err.type, 'error');
            }
        });
    }

    connectToRoom(roomId) {
        this.conn = this.peer.connect(roomId, {
            reliable: true
        });

        this.conn.on('open', () => {
            console.log('Connected to peer');
            this.handleConnection(this.conn);
        });

        this.conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.showToast('连接失败，请检查房间ID', 'error');
            this.updateConnectionStatus('error', '连接失败');
        });
    }

    handleConnection(conn) {
        this.conn = conn;
        this.setupConnectionHandlers();

        if (this.conn.open) {
            this.onPeerConnected();
        } else {
            this.conn.on('open', () => {
                this.onPeerConnected();
            });
        }
    }

    setupConnectionHandlers() {
        this.conn.on('data', (data) => {
            this.handleData(data);
        });

        this.conn.on('close', () => {
            this.showToast('对方已断开连接', 'error');
            this.updateConnectionStatus('error', '连接已断开');
            this.elements.peerInfo.classList.add('hidden');
            this.elements.transferPanel.classList.add('hidden');
            this.elements.receivePanel.classList.add('hidden');
        });
    }

    onPeerConnected() {
        this.updateConnectionStatus('connected', '已连接');
        this.elements.peerInfo.classList.remove('hidden');
        this.elements.transferPanel.classList.remove('hidden');
        this.elements.receivePanel.classList.remove('hidden');
        this.showToast('连接成功！可以开始传输文件了', 'success');
    }

    updateConnectionStatus(status, message) {
        this.elements.connectionStatus.textContent = message;
        this.elements.connectionStatus.className = 'status ' + status;
    }

    copyRoomId() {
        navigator.clipboard.writeText(this.roomId).then(() => {
            this.showToast('房间ID已复制到剪贴板', 'success');
        }).catch(() => {
            this.showToast('复制失败，请手动复制', 'error');
        });
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
            <div class="file-item">
                <div class="file-info">
                    <span class="file-icon">${this.getFileIcon(file.name)}</span>
                    <div class="file-details">
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                    </div>
                </div>
                <button class="file-remove" onclick="app.removeFile(${index})">✕</button>
            </div>
        `).join('');
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
            this.showToast('请先选择文件', 'error');
            return;
        }

        if (!this.conn || !this.conn.open) {
            this.showToast('未连接到对方', 'error');
            return;
        }

        this.filesToSend.forEach(file => {
            this.sendFile(file);
        });

        this.filesToSend = [];
        this.renderFileList();
        this.elements.sendFilesBtn.classList.add('hidden');
    }

    sendFile(file) {
        const fileId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const fileSize = file.size;
        const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);

        this.conn.send({
            type: 'file-meta',
            fileId: fileId,
            fileName: file.name,
            fileSize: fileSize,
            totalChunks: totalChunks
        });

        this.addProgressItem(fileId, file.name, fileSize);

        let sentChunks = 0;

        const sendNextChunk = () => {
            if (sentChunks >= totalChunks) {
                return;
            }

            const start = sentChunks * this.CHUNK_SIZE;
            const end = Math.min(start + this.CHUNK_SIZE, fileSize);
            const chunkData = file.slice(start, end);

            const reader = new FileReader();

            reader.onload = (e) => {
                this.conn.send({
                    type: 'file-chunk',
                    fileId: fileId,
                    chunk: e.target.result,
                    chunkIndex: sentChunks,
                    totalChunks: totalChunks
                });

                sentChunks++;

                const progress = Math.round((sentChunks / totalChunks) * 100);
                const bytesSent = Math.min(sentChunks * this.CHUNK_SIZE, fileSize);
                this.updateProgress(fileId, progress, bytesSent);

                if (sentChunks < totalChunks) {
                    setTimeout(sendNextChunk, 5);
                } else {
                    setTimeout(() => {
                        this.conn.send({
                            type: 'file-complete',
                            fileId: fileId,
                            fileSize: fileSize
                        });

                        this.updateProgress(fileId, 100, fileSize, '已完成');
                        this.addToHistory('sent', file.name, fileSize);
                        this.showToast(`文件 "${file.name}" 发送完成`, 'success');
                    }, 50);
                }
            };

            reader.onerror = () => {
                this.showToast(`文件 "${file.name}" 读取失败`, 'error');
            };

            reader.readAsArrayBuffer(chunkData);
        };

        sendNextChunk();
    }

    handleData(data) {
        if (data.type === 'file-meta') {
            this.receiveFileMeta(data);
        } else if (data.type === 'file-chunk') {
            this.receiveFileChunk(data);
        } else if (data.type === 'file-complete') {
            this.completeFileReceive(data);
        }
    }

    receiveFileMeta(data) {
        const { fileId, fileName, fileSize, totalChunks } = data;
        this.fileChunks[fileId] = {
            fileName: fileName,
            fileSize: fileSize,
            totalChunks: totalChunks,
            chunks: new Array(totalChunks),
            receivedChunks: 0
        };

        this.renderIncomingFile(fileId, fileName, fileSize);
    }

    renderIncomingFile(fileId, fileName, fileSize) {
        this.elements.incomingFiles.innerHTML = `
            <div class="incoming-file" id="incoming-${fileId}">
                <div class="file-info">
                    <span class="file-icon">${this.getFileIcon(fileName)}</span>
                    <div class="file-details">
                        <span class="file-name">${fileName}</span>
                        <span class="file-size">${this.formatFileSize(fileSize)}</span>
                    </div>
                </div>
                <div>
                    <button class="accept-btn" onclick="app.acceptFile('${fileId}')">接收</button>
                    <button class="decline-btn" onclick="app.declineFile('${fileId}')">拒绝</button>
                </div>
            </div>
        `;
    }

    acceptFile(fileId) {
        const fileData = this.fileChunks[fileId];
        if (!fileData) return;

        this.addProgressItem(fileId, fileData.fileName, fileData.fileSize);
        const incomingEl = document.getElementById('incoming-' + fileId);
        if (incomingEl) incomingEl.classList.add('hidden');

        const chunkIndices = Array.from(fileData.receivedChunks).sort((a, b) => a - b);
        chunkIndices.forEach(index => {
            if (fileData.chunks[index]) {
                this.processReceivedChunk(fileId, index);
            }
        });
    }

    declineFile(fileId) {
        delete this.fileChunks[fileId];
        document.getElementById('incoming-' + fileId).remove();
        this.elements.incomingFiles.innerHTML = '<p class="empty-tip">暂无接收文件</p>';
    }

    receiveFileChunk(data) {
        const { fileId, chunk, chunkIndex, fileSize } = data;

        if (!this.fileChunks[fileId]) {
            this.fileChunks[fileId] = {
                fileSize: fileSize || 0,
                chunks: {},
                receivedChunks: new Set()
            };
        }

        const fileData = this.fileChunks[fileId];
        fileData.chunks[chunkIndex] = chunk;
        fileData.receivedChunks.add(chunkIndex);

        const receivedCount = fileData.receivedChunks.size;
        const totalChunks = Object.keys(fileData.chunks).length;
        const progress = Math.round((receivedCount / totalChunks) * 100);
        const bytesReceived = Math.min(receivedCount * this.CHUNK_SIZE, fileData.fileSize);

        this.updateProgress(fileId, progress, bytesReceived);
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

        this.updateProgress(fileId, 100, fileData.fileSize, '下载完成');
        this.addToHistory('received', fileData.fileName, fileData.fileSize);
        this.showToast(`文件 "${fileData.fileName}" 已下载`, 'success');

        delete this.fileChunks[fileId];
    }

    completeFileReceive(data) {
        const fileId = data.fileId;
        const fileSize = data.fileSize;
        const fileName = data.fileName;

        if (!this.fileChunks[fileId]) {
            this.fileChunks[fileId] = {
                fileName: fileName,
                fileSize: fileSize,
                chunks: {},
                receivedChunks: new Set()
            };
        }

        const fileData = this.fileChunks[fileId];
        fileData.fileSize = fileSize;
        fileData.fileName = fileName || fileData.fileName;

        const checkAndProcess = () => {
            const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
            const receivedCount = fileData.receivedChunks.size;

            if (receivedCount >= totalChunks) {
                this.processReceivedChunk(fileId, 0);
            } else {
                setTimeout(() => {
                    const fileData2 = this.fileChunks[fileId];
                    if (fileData2) {
                        const newReceivedCount = fileData2.receivedChunks.size;
                        if (newReceivedCount >= totalChunks) {
                            this.processReceivedChunk(fileId, 0);
                        } else {
                            this.showToast('等待文件传输完成...', '');
                        }
                    }
                }, 500);
            }
        };

        checkAndProcess();
    }

    addProgressItem(fileId, fileName, fileSize) {
        const progressItem = document.createElement('div');
        progressItem.className = 'progress-item';
        progressItem.id = 'progress-item-' + fileId;
        progressItem.innerHTML = `
            <div class="progress-header">
                <span class="progress-name">${fileName}</span>
                <span class="progress-status" id="progress-status-${fileId}">0%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" id="progress-bar-${fileId}" style="width: 0%"></div>
            </div>
            <div class="progress-details">
                <span id="progress-current-${fileId}">0 KB</span>
                <span id="progress-total-${fileId}">/ ${this.formatFileSize(fileSize)}</span>
            </div>
        `;
        this.elements.progressList.appendChild(progressItem);
    }

    updateProgress(fileId, percentage, currentSize, status = null) {
        const progressBar = document.getElementById('progress-bar-' + fileId);
        const progressStatus = document.getElementById('progress-status-' + fileId);
        const progressCurrent = document.getElementById('progress-current-' + fileId);

        if (progressBar) {
            progressBar.style.width = percentage + '%';
        }
        if (progressStatus) {
            progressStatus.textContent = status || percentage + '%';
        }
        if (progressCurrent) {
            progressCurrent.textContent = this.formatFileSize(currentSize);
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
            this.elements.transferHistory.innerHTML = '<p class="empty-tip">暂无传输记录</p>';
            this.elements.clearHistory.classList.add('hidden');
            return;
        }

        this.elements.clearHistory.classList.remove('hidden');
        this.elements.transferHistory.innerHTML = this.transferHistory.map(item => `
            <div class="history-item">
                <div class="history-info">
                    <span class="history-type ${item.type}">${item.type === 'sent' ? '发送' : '接收'}</span>
                    <span>${item.fileName}</span>
                </div>
                <span style="color: #999; font-size: 0.85rem;">${this.formatFileSize(item.fileSize)}</span>
            </div>
        `).join('');
    }

    clearHistory() {
        this.transferHistory = [];
        this.renderHistory();
        this.showToast('传输历史已清空', 'success');
    }

    getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const icons = {
            pdf: '📕',
            doc: '📘', docx: '📘',
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
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showToast(message, type = '') {
        this.elements.toast.textContent = message;
        this.elements.toast.className = 'toast ' + type;
        this.elements.toast.classList.remove('hidden');

        setTimeout(() => {
            this.elements.toast.classList.add('hidden');
        }, 3000);
    }
}

const app = new FileTransferApp();
