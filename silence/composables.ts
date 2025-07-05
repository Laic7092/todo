import SilenceDB, { Operate } from './db';
import type { OperateRecord } from './db'
import SilencePeer, { EventType } from './p2p';
import { ref } from "vue";

enum MsgType {
    requst = 'REQUEST',
    response = 'RESPONSE',
}

interface Msg {
    type: MsgType,
    from: string,
    to: string,
    id: string,
    operate?: Operate,
    data?: any
}

const OPERATE_ID = 'operates'

const idb = new SilenceDB({
    dbName: 'todoList',
    versionchangeHandler: (db) => {
        db.createObjectStore('todoList', { keyPath: 'id' });
    }
});
export const useSync = (
    baseToken: string = "BRK-P2P-TOKEN-",
    maxPeers: number = 5,
) => {
    const devices = ref();
    const myId = ref()
    const setReactivitys = () => {
        console.log("setReactivitys");
        devices.value = peer.getConnectedDevices()
    }

    const sync = () => {
        const devices = peer.getConnectedDevices()
        devices.forEach(device => {
            peer.send(device, {
                type: MsgType.requst,
                id: OPERATE_ID,
                from: peer.id,
                to: device
            })
        });
    }

    const dataHandler = async (msg: Msg) => {
        const { type, id, from, to, data, operate } = msg
        const [storeName, key] = id.split('/')
        if (type === MsgType.requst) {
            const dt = await (key ? idb.get(storeName, key) : idb.getAll(storeName))
            peer.send(from, { type: MsgType.response, id, from: to, to: from, data: dt })
        } else if (type === MsgType.response) {
            if (id === OPERATE_ID) {
                console.log('diff!');

                diff(await idb.getAll(OPERATE_ID), data)
            }
            if (operate === Operate.add) {
                await idb.add(storeName, data, { recordOperate: false })
            } else if (operate === Operate.put) {
                await idb.put(storeName, data, key, { recordOperate: false })
            }
            console.debug(data)
        }
    }

    const diff = async (localRecords: OperateRecord[], remoteRecords: OperateRecord[]) => {
        // 1. 创建映射表便于快速查找
        const localMap = new Map<string, OperateRecord>();
        const remoteMap = new Map<string, OperateRecord>();

        // 2. 填充映射表
        localRecords.forEach(record => localMap.set(record.id, record));
        remoteRecords.forEach(record => remoteMap.set(record.id, record));

        // 3. 找出需要同步的操作
        const operationsToSync: OperateRecord[] = [];

        // 3.1 检查远程有但本地没有的记录（新增）
        for (const [id, remoteRecord] of remoteMap) {
            if (!localMap.has(id)) {
                operationsToSync.push(remoteRecord);
            }
        }

        // 3.2 检查本地有但远程没有的记录（需要发送给远程）
        for (const [id, localRecord] of localMap) {
            if (!remoteMap.has(id)) {
                operationsToSync.push(localRecord);
            }
        }

        // 3.3 检查双方都有的记录，但时间戳更新的（修改）
        for (const [id, localRecord] of localMap) {
            const remoteRecord = remoteMap.get(id);
            if (remoteRecord) {
                // 时间戳比较，取最新的操作
                if (localRecord.timestamp > remoteRecord.timestamp) {
                    operationsToSync.push(localRecord);
                } else if (remoteRecord.timestamp > localRecord.timestamp) {
                    operationsToSync.push(remoteRecord);
                }

                // 特殊处理删除操作
                if (remoteRecord.operateType === Operate.delete &&
                    localRecord.operateType !== Operate.delete) {
                    operationsToSync.push(remoteRecord);
                } else if (localRecord.operateType === Operate.delete &&
                    remoteRecord.operateType !== Operate.delete) {
                    operationsToSync.push(localRecord);
                }
            }
        }

        // 4. 对需要同步的操作按时间排序
        operationsToSync.sort((a, b) => a.timestamp - b.timestamp);

        // 5. 应用同步操作到本地数据库
        for (const operation of operationsToSync) {
            try {
                switch (operation.operateType) {
                    case Operate.add:
                        await idb.add(operation.storeName, operation.data, { recordOperate: false });
                        break;
                    case Operate.put:
                        await idb.put(operation.storeName, operation.data, operation.key, { recordOperate: false });
                        break;
                    case Operate.delete:
                        await idb.delete(operation.storeName, operation.key, { recordOperate: false });
                        break;
                }

                // 更新操作记录（避免循环同步）
                await idb.put(OPERATE_ID, operation, operation.id, { recordOperate: false });
            } catch (error) {
                console.error('同步操作失败:', operation, error);
            }
        }

        // 6. 返回需要同步的操作数量
        return operationsToSync.length;
    };

    const peer = new SilencePeer({ baseToken, maxPeers });
    peer.on(EventType.Connect, setReactivitys)
    peer.on(EventType.Disconnect, setReactivitys)
    peer.on(EventType.Data, dataHandler)

    const init = () => peer.init().then(() => myId.value = peer.id)

    init()

    return {
        devices,
        myId,
        reqOperates: sync
    };
};

export const useTodoList = () => {

    interface TodoItem {
        id: string;
        text: string;
        done: boolean;
    }

    idb.on(Operate.add, (data) => {
        idb.getAll('todoList').then(res => {
            todoList.value = res;
        });
    })
    idb.on(Operate.put, (data) => {
        idb.getAll('todoList').then(res => {
            todoList.value = res;
        });
    })
    idb.on(Operate.delete, (data) => {
        idb.getAll('todoList').then(res => {
            todoList.value = res;
        });
    })

    const todoList = ref<TodoItem[]>([]);
    idb.getAll('todoList').then(res => {
        todoList.value = res;
    });
    const add = async (text: string) => {
        try {
            const id = SilenceDB.useId()
            await idb.add('todoList', { text, done: false, id });
            todoList.value.push({ id, text, done: false });
        } catch (error) {
            console.log(error);
        }
    };
    const remove = async (id: string) => {
        try {
            await idb.delete('todoList', id);
            todoList.value = todoList.value.filter(item => item.id !== id);
        } catch (error) {
            console.log(error);
        }
    };

    const update = async (id: string, data: TodoItem) => {
        console.log(data);

        try {
            const res = await idb.put('todoList', { id, ...data });
            const item = todoList.value.find(item => item.id === id)
            item.done = data.done;
            item.text = data.text;
        } catch (error) {
            console.log(error);
        }
    };

    const clear = () => {
        idb.clear('todoList').then(() => {
            todoList.value = [];
        });
        idb.clear(OPERATE_ID);
    }

    return { todoList, add, remove, update, clear };
};