import Peer, { DataConnection } from "peerjs";

// 独立的P2P客户端类
export default class P2PClient {
    protected peer: Peer | null = null;
    private connections: Record<string, DataConnection[]> = {};
    public devices: Set<string> = new Set();
    private idx = 0;
    netChangeHandler: () => void;

    constructor(private baseToken: string, private maxPeers: number, netChangeHandler: () => void) {
        this.autoClean()
        this.netChangeHandler = netChangeHandler
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
    setListeners(): void {
        if (!this.peer) return;

        this.peer.on("connection", (conn) => {
            conn.on("open", () => {
                this.devices.add(conn.peer);
                this.connections[conn.peer] = this.connections[conn.peer] || [];
                this.connections[conn.peer].push(conn);
                this.netChangeHandler()
            });

            conn.on("data", (data) => {
                console.log("Received data:", data);
                alert(data);
            });

            conn.on("close", () => {
                this.devices.delete(conn.peer);
                delete this.connections[conn.peer];
                this.netChangeHandler()
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
}