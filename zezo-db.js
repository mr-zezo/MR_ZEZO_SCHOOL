// =================================================================
// محرك بيانات مستر زيزو الموحد (Zezo Unified Database Engine)
// يدعم التبديل التلقائي بين السحابة (Supabase) والذاكرة المحلية (Offline)
// =================================================================

const ZezoDB = {
    
    // 1. معرفة حالة النظام الحالية
    getMode: function() {
        return localStorage.getItem('zezo_operating_mode') || 'online';
    },

    // 2. إعدادات الذاكرة المحلية (يجب أن تتطابق مع صفحة الإدارة)
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

    // ================= دوال جلب البيانات (Read) =================
    getAll: async function(tableName) {
        if (this.getMode() === 'offline') {
            // جلب من الذاكرة المحلية
            const db = await this.openLocalDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE_NAME, "readonly");
                const store = tx.objectStore(this.STORE_NAME);
                const req = store.get(tableName);
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        } else {
            // جلب من السحابة (Supabase)
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

    // ================= دوال الحفظ والتعديل (Insert / Update) =================
    upsert: async function(tableName, recordsArray, conflictKey = 'id') {
        if (this.getMode() === 'offline') {
            // حفظ في الذاكرة المحلية
            let currentData = await this.getAll(tableName);
            
            // دمج البيانات الجديدة مع القديمة
            recordsArray.forEach(newRecord => {
                const index = currentData.findIndex(old => old[conflictKey] === newRecord[conflictKey]);
                if (index > -1) {
                    currentData[index] = { ...currentData[index], ...newRecord }; // تحديث
                } else {
                    currentData.push(newRecord); // إضافة جديدة
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
            // حفظ في السحابة (Supabase)
            const { data, error } = await supabaseClient.from(tableName).upsert(recordsArray, { onConflict: conflictKey });
            if (error) throw error;
            return { success: true, data };
        }
    },

    // ================= دوال الحذف (Delete) =================
    delete: async function(tableName, keyName, keyValue) {
        if (this.getMode() === 'offline') {
            // حذف من الذاكرة المحلية
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
            // حذف من السحابة (Supabase)
            const { error } = await supabaseClient.from(tableName).delete().eq(keyName, keyValue);
            if (error) throw error;
            return { success: true };
        }
    }
};