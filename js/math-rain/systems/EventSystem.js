/**
 * Event System for Math Rain Game
 * Provides a central event bus for loose coupling between components
 */

class EventSystem {
    constructor() {
        this.listeners = new Map();
        this.onceListeners = new Map();
        this.isDestroyed = false;
    }

    /**
     * Subscribe to an event
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Callback function
     * @param {Object} context - Context to bind the callback to
     */
    on(eventName, callback, context = null) {
        if (this.isDestroyed) {
            console.warn(`Cannot subscribe to event '${eventName}' - EventSystem is destroyed`);
            return;
        }

        if (typeof callback !== 'function') {
            console.error(`Callback for event '${eventName}' must be a function`);
            return;
        }

        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }

        this.listeners.get(eventName).push({
            callback,
            context
        });
    }

    /**
     * Subscribe to an event that will only fire once
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Callback function
     * @param {Object} context - Context to bind the callback to
     */
    once(eventName, callback, context = null) {
        if (this.isDestroyed) {
            console.warn(`Cannot subscribe to event '${eventName}' - EventSystem is destroyed`);
            return;
        }

        if (typeof callback !== 'function') {
            console.error(`Callback for event '${eventName}' must be a function`);
            return;
        }

        if (!this.onceListeners.has(eventName)) {
            this.onceListeners.set(eventName, []);
        }

        this.onceListeners.get(eventName).push({
            callback,
            context
        });
    }

    /**
     * Unsubscribe from an event
     * @param {string} eventName - Name of the event
     * @param {Function} callback - Callback function to remove
     * @param {Object} context - Context the callback was bound to
     */
    off(eventName, callback, context = null) {
        if (this.isDestroyed) {
            return;
        }

        // Remove from regular listeners
        if (this.listeners.has(eventName)) {
            const listeners = this.listeners.get(eventName);
            const index = listeners.findIndex(listener => 
                listener.callback === callback && listener.context === context
            );
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.listeners.delete(eventName);
                }
            }
        }

        // Remove from once listeners
        if (this.onceListeners.has(eventName)) {
            const listeners = this.onceListeners.get(eventName);
            const index = listeners.findIndex(listener => 
                listener.callback === callback && listener.context === context
            );
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.onceListeners.delete(eventName);
                }
            }
        }
    }

    /**
     * Emit an event to all subscribers
     * @param {string} eventName - Name of the event
     * @param {*} data - Data to pass to subscribers
     */
    emit(eventName, data = null) {
        if (this.isDestroyed) {
            return;
        }

        try {
            // Handle regular listeners
            if (this.listeners.has(eventName)) {
                const listeners = [...this.listeners.get(eventName)]; // Create copy to avoid modification during iteration
                listeners.forEach(({ callback, context }) => {
                    try {
                        if (context) {
                            callback.call(context, data);
                        } else {
                            callback(data);
                        }
                    } catch (error) {
                        console.error(`Error in event listener for '${eventName}':`, error);
                    }
                });
            }

            // Handle once listeners
            if (this.onceListeners.has(eventName)) {
                const listeners = [...this.onceListeners.get(eventName)]; // Create copy
                this.onceListeners.delete(eventName); // Clear once listeners after emission

                listeners.forEach(({ callback, context }) => {
                    try {
                        if (context) {
                            callback.call(context, data);
                        } else {
                            callback(data);
                        }
                    } catch (error) {
                        console.error(`Error in once event listener for '${eventName}':`, error);
                    }
                });
            }
        } catch (error) {
            console.error(`Error emitting event '${eventName}':`, error);
        }
    }

    /**
     * Remove all listeners for a specific event
     * @param {string} eventName - Name of the event
     */
    removeAllListeners(eventName) {
        if (this.isDestroyed) {
            return;
        }

        if (eventName) {
            this.listeners.delete(eventName);
            this.onceListeners.delete(eventName);
        } else {
            this.listeners.clear();
            this.onceListeners.clear();
        }
    }

    /**
     * Get all event names that have listeners
     * @returns {string[]} Array of event names
     */
    getEventNames() {
        if (this.isDestroyed) {
            return [];
        }

        const eventNames = new Set([
            ...this.listeners.keys(),
            ...this.onceListeners.keys()
        ]);
        return Array.from(eventNames);
    }

    /**
     * Get listener count for a specific event
     * @param {string} eventName - Name of the event
     * @returns {number} Number of listeners
     */
    getListenerCount(eventName) {
        if (this.isDestroyed) {
            return 0;
        }

        const regularCount = this.listeners.has(eventName) ? this.listeners.get(eventName).length : 0;
        const onceCount = this.onceListeners.has(eventName) ? this.onceListeners.get(eventName).length : 0;
        return regularCount + onceCount;
    }

    /**
     * Destroy the event system and clean up all listeners
     */
    destroy() {
        this.listeners.clear();
        this.onceListeners.clear();
        this.isDestroyed = true;
    }
}

// ES Module export
export default EventSystem;

// CommonJS compatibility
if (typeof window !== 'undefined') {
    window.EventSystem = EventSystem;
}