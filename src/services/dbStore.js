// dbStore.js - Service for PostgreSQL-backed Key-Value storage with automatic migration

const getBackendBaseUrl = () => {
  const host = window.location.hostname || 'localhost';
  const isLocal = host === 'localhost' || 
                  host === '127.0.0.1' || 
                  host.startsWith('192.168.') || 
                  host.startsWith('10.') || 
                  host.startsWith('172.') || 
                  host.endsWith('.local');
  if (isLocal) {
    return `http://${host}:8000/api/store`;
  }
  return 'https://gis-kpi-backend.onrender.com/api/store';
};

/**
 * Retrieve a JSON value from the database store.
 * If not found in the DB, it checks localStorage (automatic migration) and saves it to the DB.
 * If not found anywhere, it returns the fallback.
 */
export const loadFromDb = async (key, fallback = null) => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/${key}`);
    if (response.ok) {
      const data = await response.json();
      if (data && data.value) {
        // Cache to localStorage
        localStorage.setItem(key, data.value);
        return JSON.parse(data.value);
      }
    }
  } catch (error) {
    console.error(`Error loading key "${key}" from DB:`, error);
  }

  // Fallback to local storage (for migration or offline cache)
  try {
    const localSaved = localStorage.getItem(key);
    if (localSaved !== null) {
      const parsed = JSON.parse(localSaved);
      // Proactively migrate to database in background
      saveToDb(key, parsed).catch(err => console.error(`Migration error for key "${key}":`, err));
      return parsed;
    }
  } catch (e) {
    console.error(`Error reading localStorage for "${key}":`, e);
  }

  return fallback;
};

/**
 * Save a value (object or array) to the database store.
 * Serializes the value to JSON and caches it locally in localStorage.
 */
export const saveToDb = async (key, value) => {
  const jsonString = JSON.stringify(value);
  
  // Cache to localStorage immediately
  try {
    localStorage.setItem(key, jsonString);
  } catch (e) {
    console.error(`Error updating localStorage cache for "${key}":`, e);
  }

  try {
    const response = await fetch(getBackendBaseUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: key,
        value: jsonString
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data; // Return full DB object (key, value, status, result, updated_at, version)
    } else {
      console.error(`Failed to save key "${key}" to DB: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Network error saving key "${key}" to DB:`, error);
    return null;
  }
};

/**
 * Transition a store value's status to 'completed'.
 */
export const completeStore = async (key) => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/${key}/complete`, {
      method: 'POST'
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error(`Error completing store for key "${key}":`, error);
  }
  return null;
};

/**
 * Transition a store value's status to 'cleared'.
 */
export const clearStore = async (key) => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/${key}/clear`, {
      method: 'POST'
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error(`Error clearing store for key "${key}":`, error);
  }
  return null;
};

/**
 * Check if a store value is in 'draft' status.
 */
export const isStoreDraft = async (key) => {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/${key}`);
    if (response.ok) {
      const data = await response.json();
      return data && data.status === 'draft';
    }
  } catch (error) {
    console.error(`Error checking draft status for key "${key}":`, error);
  }
  return false;
};
