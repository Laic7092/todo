import { ref } from "vue";
import P2PClient from "./p2p";
import SilenceIDB from "./db";



export const useSync = () => {
    const isOnline = ref(navigator.onLine);

    window.addEventListener("offline", (e) => {
        console.log("offline");
    });

    window.addEventListener("online", (e) => {
        console.log("online");
    });

    const sync = () => {
        if (isOnline.value) {
            console.log("sync");
        }
    }

    return {
        isOnline,
        sync
    }
}
