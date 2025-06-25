import SilenceIDB from './db';
import P2PClient from './p2p';
import { ref } from "vue";

export const useP2P = (
    baseToken: string = "BRK-P2P-TOKEN-",
    maxPeers: number = 3
) => {
    const devices = ref();
    const myId = ref()

    const setReactivitys = () => {
        myId.value = client.getPeerId()
        devices.value = JSON.parse(JSON.stringify(Array.from(client.devices)))
    }

    const client = new P2PClient(baseToken, maxPeers, setReactivitys);

    const init = () => client.init().then(setReactivitys)

    const scan = () => client.scanAndConnect()

    init()
    setInterval(scan, 5000)

    return {
        init,
        scan,
        devices,
        myId,
    };
};

export const useTodoList = () => {

    interface TodoItem {
        id: string;
        text: string;
        done: boolean;
    }

    const idb = new SilenceIDB({
        dbName: 'todoList',
        versionchangeHandler: (db) => {
            db.createObjectStore('todoList', { keyPath: 'id' });
        }
    });

    const { devices, myId } = useP2P();

    const todoList = ref<TodoItem[]>([]);
    idb.getAll('todoList').then(res => {
        todoList.value = res;
    });
    const add = async (text: string) => {
        try {
            const id = SilenceIDB.useId()
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
        try {
            const res = await idb.put('todoList', { id, ...data });
            todoList.value = todoList.value.map(item => item.id === id ? { ...item, done } : item);
        } catch (error) {

        }
    };

    return { todoList, add, remove, update, myId, devices };
};
