// =================================================================
// محرك بيانات مستر زيزو الموحد (Zezo Unified Database Engine)
// =================================================================

// ⚠️ ضع مفاتيح مشروعك هنا لكي يعمل الأونلاين ⚠️
const SUPABASE_URL = "https://xgsyktjoerrymqoutqcb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnc3lrdGpvZXJyeW1xb3V0cWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NzI2OTUsImV4cCI6MjA5OTA0ODY5NX0.fVdQnU8lQnacNzDTNXtAODbV3Jbgq5ACg5KIw0HFYLM";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ZezoDB = {
    getMode: function() {
        return localStorage.getItem('zezo_operating_mode') || 'online';
    },

    DB_NAME: "MR_ZEZO_OFFLINE_STORAGE_V3",
    STORE_NAME: "school_master_store",

    openLocalDB: function() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    getAll: async function(tableName) {
        if (this.getMode() === 'offline') {
            const db = await this.openLocalDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE_NAME, "readonly");
                const store = tx.objectStore(this.STORE_NAME);
                const req = store.get(tableName);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        } else {
            let all = [];
            let start = 0;
            const step = 1000;
            let hasMore = true;
            while(hasMore) {
                const { data, error } = await supabaseClient.from(tableName).select('*').range(start, start + step - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                all = all.concat(data);
                start += step;
                if (data.length < step) hasMore = false;
            }
            return all;
        }
    },

    upsert: async function(tableName, recordsArray, conflictKey = 'id') {
        if (this.getMode() === 'offline') {
            let currentData = await this.getAll(tableName);
            recordsArray.forEach(newRecord => {
                const index = currentData.findIndex(old => old[conflictKey] === newRecord[conflictKey]);
                if (index > -1) {
                    currentData[index] = { ...currentData[index], ...newRecord };
                } else {
                    currentData.push(newRecord);
                }
            });
            const db = await this.openLocalDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE_NAME, "readwrite");
                const store = tx.objectStore(this.STORE_NAME);
                store.put(currentData, tableName);
                tx.oncomplete = () => resolve({ success: true });
                tx.onerror = () => reject(tx.error);
            });
        } else {
            const { data, error } = await supabaseClient.from(tableName).upsert(recordsArray, { onConflict: conflictKey });
            if (error) throw error;
            return { success: true, data };
        }
    },

    delete: async function(tableName, keyName, keyValue) {
        if (this.getMode() === 'offline') {
            let currentData = await this.getAll(tableName);
            currentData = currentData.filter(record => record[keyName] !== keyValue);
            const db = await this.openLocalDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE_NAME, "readwrite");
                const store = tx.objectStore(this.STORE_NAME);
                store.put(currentData, tableName);
                tx.oncomplete = () => resolve({ success: true });
                tx.onerror = () => reject(tx.error);
            });
        } else {
            const { error } = await supabaseClient.from(tableName).delete().eq(keyName, keyValue);
            if (error) throw error;
            return { success: true };
        }
    }
};
