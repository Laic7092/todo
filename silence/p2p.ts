import Peer, { DataConnection } from "peerjs";

export enum EventType {
    connect,
    disconnect,
    data
}

interface Config {
    baseToken: string
    maxPeers: number
}

// 独立的P2P客户端类
export default class P2PClient {
    private baseToken: string
    private maxPeers: number
    protected peer: Peer | null = null;
    private connections: Record<string, DataConnection[]> = {};
    public devices: Set<string> = new Set();
    private idx = 0;
    private handlers: Map<EventType, (e: any) => void> = new Map()

    constructor(config: Config) {
        this.baseToken = config.baseToken
        this.maxPeers = config.maxPeers
        this.autoClean()
    }

    // 初始化Peer连接
    async init(): Promise<void> {
        for (let i = 0; i < this.maxPeers; i++) {
            const id = this.baseToken + i;
            try {
                this.peer = await this.createPeerIfAvailable(id);
                this.setListeners()
                break;
            } catch (error) {
                console.error("init error:", error);
            }
        }
    }
    private autoClean(): void {
        addEventListener('beforeunload', this.clear)
    }
    // 创建并检查Peer ID是否可用
    private createPeerIfAvailable(id: string): Promise<Peer> {
        return new Promise((resolve, reject) => {
            if (this.peer?.id === id) {
                reject(new Error("ID already in use"));
                return;
            }

            const _peer = new Peer(id);
            const onError = (err: Error) => {
                _peer.off("open", onOpen);
                _peer.off("error", onError);
                if ((err as any).type === "unavailable-id") {
                    this.idx++;
                    this.devices.add(id);
                    reject(err);
                } else {
                    reject(err);
                }
            };

            const onOpen = () => {
                _peer.off("error", onError);
                _peer.off("open", onOpen);
                resolve(_peer);
            };

            _peer.on("error", onError);
            _peer.on("open", onOpen);
        });
    }

    // 设置事件监听
    private setListeners(): void {
        if (!this.peer) return;

        this.peer.on("connection", (conn) => {
            conn.on("open", () => {
                this.devices.add(conn.peer);
                this.connections[conn.peer] = this.connections[conn.peer] || [];
                this.connections[conn.peer].push(conn);
                const handler = this.handlers.get(EventType.connect)
                handler && handler(conn.peer)
            });

            conn.on("data", (data) => {
                console.log("Received data:", data);
                const handler = this.handlers.get(EventType.data)
                handler && handler(data);
            });

            conn.on("close", () => {
                this.devices.delete(conn.peer);
                delete this.connections[conn.peer];
                const handler = this.handlers.get(EventType.disconnect)
                handler && handler(conn.peer)
            });

            conn.on("error", (error) => {
                console.error("Connection error:", error);
            });
        });

        this.peer.on("error", (error) => {
            console.error("Peer error:", error);
        });
    }

    // 广播消息给所有连接
    broadcast(data: any): void {
        Object.values(this.connections).forEach((connList) => {
            connList.forEach((conn) => {
                if (conn.open) {
                    conn.send(data);
                }
            });
        });
    }

    // 扫描可用的Peer ID
    scanAndConnect(): void {
        if (!this.peer) return;
        for (let i = 0; i < this.maxPeers; i++) {
            const id = this.baseToken + i;
            !this.connections[id] && this.peer.id !== id && this.peer.connect(id);
        }
    }

    // 获取当前Peer ID
    getPeerId(): string | undefined {
        return this.peer?.id;
    }

    // 清理资源
    clear(): void {
        removeEventListener("beforeunload", this.clear)
        if (this.peer) {
            Object.values(this.connections).forEach((connList) => {
                connList.forEach((conn) => conn.close());
            });
            this.peer.destroy();
            this.peer = null;
            this.connections = {};
            this.devices.clear();
            this.idx = 0;
        }
    }

    send(deviceId: string, data: any): void {
        if (!this.connections[deviceId]) {
            this.peer?.connect(deviceId);
        }
        this.connections[deviceId]?.forEach((conn) => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }
    on(eventType: EventType, handler: (e: any) => void) {
        this.handlers.set(eventType, handler)
    }

    off(eventType: EventType) {
        this.handlers.delete(eventType)
    }
}