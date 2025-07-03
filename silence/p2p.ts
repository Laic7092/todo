import Peer, { DataConnection } from "peerjs";

export enum EventType {
    Connect,
    Disconnect,
    Data,
    Error
}

interface Config {
    baseToken?: string;
    maxPeers?: number;
}

type EventHandler<T = any> = (data: T) => void;

// 独立的P2P客户端类
export default class P2PClient {
    private readonly baseToken: string;
    private readonly maxPeers: number;

    protected peer: Peer | null = null;
    private connections: Record<string, DataConnection> = {};
    private handlers: Map<EventType, Set<EventHandler>> = new Map();
    private cleanupCallbacks: Array<() => void> = [];

    constructor(config: Config = {}) {
        this.baseToken = config.baseToken ?? "BRK-P2P-TOKEN-";
        this.maxPeers = config.maxPeers ?? 3;
        const beforeUnloadHandler = () => this.clear();
        window.addEventListener('unload', beforeUnloadHandler);
        this.cleanupCallbacks.push(() => {
            window.removeEventListener('unload', beforeUnloadHandler);
        });
    }

    // 初始化Peer连接
    async init(): Promise<void> {
        if (this.peer) {
            throw new Error("Peer already initialized");
        }

        for (let i = 0; i < this.maxPeers; i++) {
            const id = this.baseToken + i;
            try {
                this.peer = await this.createPeerIfAvailable(id);
                this.scanAndConnect();
                return;
            } catch (error) {
                console.error(`Failed to initialize peer with ID ${id}:`, error);
                if (i === this.maxPeers - 1) {
                    throw new Error("All peer IDs are unavailable");
                }
            }
        }
    }

    // 创建并检查Peer ID是否可用
    private createPeerIfAvailable(id: string): Promise<Peer> {
        return new Promise((resolve, reject) => {
            if (this.peer?.id === id) {
                reject(new Error("ID already in use"));
                return;
            }

            const _peer = new Peer(id);
            let resolved = false;

            const cleanup = () => {
                _peer.off("open", onOpen);
                _peer.off("error", onError);
            };

            const onError = (err: Error) => {
                if (resolved) return;
                cleanup();

                if ((err as any).type === "unavailable-id") {
                    reject(err);
                } else {
                    reject(err);
                }
            };

            const onOpen = () => {
                resolved = true;
                cleanup();
                this.setupPeerListeners(_peer);
                resolve(_peer);
            };

            _peer.on("error", onError);
            _peer.on("open", onOpen);
        });
    }

    // 设置Peer事件监听
    private setupPeerListeners(peer: Peer): void {

        const onConnection = (conn: DataConnection) => {
            this.setupConnectionListeners(conn);
        };

        const onError = (error: Error) => {
            this.emit(EventType.Error, error);
        };

        peer.on("connection", onConnection);
        peer.on("error", onError);
    }

    // 设置连接事件监听
    private setupConnectionListeners(conn: DataConnection): void {
        const onOpen = () => {
            console.info("Connected to peer:", conn.peer);
            this.connections[conn.peer] = conn;
            this.emit(EventType.Connect, conn.peer);
        };

        const onData = (data: unknown) => {
            console.log("Received data:", data);
            this.emit(EventType.Data, data);
        };

        const onClose = () => {
            console.warn("Connection closed:", conn.peer);
            delete this.connections[conn.peer];
            this.emit(EventType.Disconnect, conn.peer);
        };

        const onError = (error: Error) => {
            console.error("Connection error:", error, conn.peer);
            this.emit(EventType.Error, error);
        };

        conn.on("open", onOpen);
        conn.on("data", onData);
        conn.on("close", onClose);
        conn.on("error", onError);
    }
    // 广播消息给所有连接
    broadcast(data: any): void {
        Object.values(this.connections).forEach((conn) => {
            if (conn.open) {
                try {
                    conn.send(data);
                } catch (error) {
                    console.error("Broadcast error:", error);
                    this.emit(EventType.Error, error);
                }
            }
        });
    }

    // 扫描可用的Peer ID
    async scanAndConnect(): Promise<void> {
        if (!this.peer) return;

        for (let i = 0; i < this.maxPeers; i++) {
            const id = this.baseToken + i;

            // 跳过自己、已有连接和正在尝试的连接
            if (this.peer.id === id ||
                this.connections[id]
            ) {
                continue;
            }

            try {
                const conn = this.peer.connect(id);
                this.setupConnectionListeners(conn);
            } catch (error) {
                console.error("Connection attempt failed:", error);
                this.emit(EventType.Error, error);
            }
        }
    }

    // 获取当前Peer ID
    getPeerId(): string | undefined {
        return this.peer?.id;
    }

    // 获取已连接设备列表
    getConnectedDevices(): string[] {
        return Object.keys(this.connections);
    }

    // 发送消息到特定设备
    async send(deviceId: string, data: any): Promise<void> {
        if (!this.peer) {
            throw new Error("Peer not initialized");
        }

        if (this.connections[deviceId]?.open) {
            this.connections[deviceId].send(data);
        } else {
            throw new Error(`Connection to ${deviceId} is not open`);
        }
    }

    // 事件监听
    on<T = any>(eventType: EventType, handler: EventHandler<T>): void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, new Set());
        }
        this.handlers.get(eventType)!.add(handler);
    }

    // 移除事件监听
    off<T = any>(eventType: EventType, handler?: EventHandler<T>): void {
        if (!handler) {
            this.handlers.delete(eventType);
        } else if (this.handlers.has(eventType)) {
            this.handlers.get(eventType)!.delete(handler);
        }
    }

    // 触发事件
    private emit(eventType: EventType, data?: any): void {
        const handlers = this.handlers.get(eventType);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${eventType} handler:`, error);
                }
            });
        }
    }

    // 清理资源
    clear(): void {
        this.cleanupCallbacks.forEach(cb => cb());
        this.cleanupCallbacks = [];

        if (this.peer) {
            Object.values(this.connections).forEach((conn) => {
                conn.close();
            });
            this.peer.destroy();
            this.peer = null;
        }

        this.connections = {};
        this.handlers.clear();
    }
}