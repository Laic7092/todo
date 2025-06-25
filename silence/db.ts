enum Operate {
    add = 'add',
    put = 'put',
    delete = 'delete',
    clear = 'clear'
}

interface OperateRecord {
    id: string;
    timestamp: number;
    dbName: string;
    storeName: string;
    operateType: Operate;
    key?: any;
    data?: any;
}

export default class SilenceIDB {
    dbName: string;
    db: IDBDatabase | null;
    dbVersion: number = 1;
    initPromise: Promise<void> | null;

    constructor({
        dbName,
        versionchangeHandler
    }: { dbName: string; versionchangeHandler?: (db: IDBDatabase) => void }) {
        this.dbName = dbName;
        this.initPromise = this.initDB(dbName, versionchangeHandler);
    }

    static useId = () => {
        return btoa(Date.now() + '' + Math.random())
    }

    initDB = (dbName: string, versionchangeHandler?: (db: IDBDatabase) => void) => {
        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onupgradeneeded = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                const store = this.db.createObjectStore('operates', { autoIncrement: true })
                store.createIndex('dbName', 'dbName');
                store.createIndex('storeName', 'storeName');
                store.createIndex('operateType', 'operateType');
                versionchangeHandler && versionchangeHandler(this.db);
            };
            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                this.dbVersion = this.db.version; // 同步实际版本号
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    };

    updateDB = async (handler: (db: IDBDatabase) => void) => {
        await this.initPromise;
        const request = indexedDB.open(this.dbName, this.dbVersion + 1); // 使用+1避免冲突
        return new Promise<void>((resolve, reject) => {
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.db = db;
                handler(db);
            };
            request.onsuccess = () => {
                this.dbVersion++;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    };

    private async recordOperation(
        transaction: IDBTransaction,
        storeName: string,
        operateType: Operate,
        key?: any,
        data?: any
    ) {
        const record: OperateRecord = {
            id: SilenceIDB.useId(),
            timestamp: Date.now(),
            dbName: this.dbName,
            storeName,
            operateType,
            key,
            data
        };

        const operateStore = transaction.objectStore('operates');
        return new Promise((resolve, reject) => {
            const request = operateStore.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private wrapStore(store: IDBObjectStore, storeName: string, transaction: IDBTransaction): IDBObjectStore {
        return new Proxy(store, {
            get: (target, prop: keyof IDBObjectStore, receiver) => {
                const original = target[prop];

                if (typeof original === 'function' &&
                    ['add', 'put', 'delete', 'clear'].includes(prop)) {

                    return (...args: any[]) => {
                        // 对于删除操作，先获取数据
                        let data: any;
                        // if (prop === 'delete') {
                        //     data = await new Promise((resolve) => {
                        //         const req = target.get(args[0]);
                        //         req.onsuccess = () => resolve(req.result);
                        //         req.onerror = () => resolve(undefined);
                        //     });
                        // }

                        const request = (original as Function).apply(target, args);

                        request.addEventListener('success', () => {
                            // 确定操作类型和key
                            let operateType: Operate | null = null;
                            let key: any;

                            switch (prop) {
                                case 'add':
                                    operateType = Operate.add;
                                    key = args[0][target.keyPath as string] || args[0];
                                    data = args[0];
                                    break;
                                case 'put':
                                    operateType = Operate.put;
                                    key = args.length > 1 ? args[1] : args[0][target.keyPath as string];
                                    data = args[0];
                                    break;
                                case 'delete':
                                    operateType = Operate.delete;
                                    key = args[0];
                                    break;
                                case 'clear':
                                    operateType = Operate.clear;
                                    break;
                            }
                            // 记录操作（与主操作同事务）
                            operateType && this.recordOperation(transaction, storeName, operateType, key, data)
                                .catch(e => console.error('Record failed:', e));
                        })

                        return request;
                    };
                }

                return Reflect.get(target, prop, receiver);
            }
        });
    }

    async tx(storeName: string, mode: IDBTransactionMode = 'readonly') {
        await this.initPromise;
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([storeName, 'operates'], mode);
        const store = transaction.objectStore(storeName);

        return mode === 'readonly' ? store : this.wrapStore(store, storeName, transaction);
    }

    async getStore(storeName: string, mode: IDBTransactionMode = 'readonly') {
        const store = await this.tx(storeName, mode);
        return store;
    }

    // 基础操作方法保持不变，但会通过代理自动记录
    add = async (storeName: string, data: any) => {
        const store = await this.tx(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    put = async (storeName: string, data: any, key?: any) => {
        const store = await this.tx(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = key !== undefined ? store.put(data, key) : store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    delete = async (storeName: string, key: any) => {
        const store = await this.tx(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    };

    get = async (storeName: string, key: any) => {
        const store = await this.tx(storeName);
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    getAll = async (storeName: string) => {
        const store = await this.tx(storeName);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.addEventListener('success', () => console.log('666'));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    clear = async (storeName: string) => {
        const store = await this.tx(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    };
}