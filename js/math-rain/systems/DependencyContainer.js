/**
 * Dependency Injection Container for Math Rain Game
 * Manages component lifecycle and dependencies
 */

class DependencyContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.factories = new Map();
        this.isDestroyed = false;
    }

    /**
     * Register a service with the container
     * @param {string} name - Service name
     * @param {Function|Object} serviceOrFactory - Service constructor or factory function
     * @param {Object} options - Registration options
     * @param {boolean} options.singleton - Whether to create as singleton
     * @param {string[]} options.dependencies - Array of dependency names
     */
    register(name, serviceOrFactory, options = {}) {
        if (this.isDestroyed) {
            throw new Error('Cannot register service - container is destroyed');
        }

        if (typeof name !== 'string' || name.length === 0) {
            throw new Error('Service name must be a non-empty string');
        }

        const registration = {
            serviceOrFactory,
            singleton: options.singleton || false,
            dependencies: options.dependencies || [],
            instance: null
        };

        this.services.set(name, registration);
    }

    /**
     * Register a singleton service
     * @param {string} name - Service name
     * @param {Function|Object} serviceOrFactory - Service constructor or factory function
     * @param {string[]} dependencies - Array of dependency names
     */
    registerSingleton(name, serviceOrFactory, dependencies = []) {
        this.register(name, serviceOrFactory, { singleton: true, dependencies });
    }

    /**
     * Register a factory function
     * @param {string} name - Service name
     * @param {Function} factory - Factory function
     * @param {string[]} dependencies - Array of dependency names
     */
    registerFactory(name, factory, dependencies = []) {
        if (typeof factory !== 'function') {
            throw new Error('Factory must be a function');
        }
        this.factories.set(name, { factory, dependencies });
    }

    /**
     * Resolve a service from the container
     * @param {string} name - Service name
     * @returns {*} The resolved service instance
     */
    resolve(name) {
        if (this.isDestroyed) {
            throw new Error('Cannot resolve service - container is destroyed');
        }

        // Check if it's a factory
        if (this.factories.has(name)) {
            return this.resolveFactory(name);
        }

        // Check if service is registered
        if (!this.services.has(name)) {
            throw new Error(`Service '${name}' is not registered`);
        }

        const registration = this.services.get(name);

        // Return existing singleton instance if available
        if (registration.singleton && registration.instance) {
            return registration.instance;
        }

        // Resolve dependencies
        const dependencies = this.resolveDependencies(registration.dependencies);

        // Create new instance
        let instance;
        if (typeof registration.serviceOrFactory === 'function') {
            // Constructor function
            if (dependencies.length === 0) {
                instance = new registration.serviceOrFactory();
            } else {
                instance = new registration.serviceOrFactory(...dependencies);
            }
        } else if (typeof registration.serviceOrFactory === 'object') {
            // Already instantiated object
            instance = registration.serviceOrFactory;
        } else {
            throw new Error(`Invalid service registration for '${name}'`);
        }

        // Store singleton instance
        if (registration.singleton) {
            registration.instance = instance;
        }

        return instance;
    }

    /**
     * Resolve a factory service
     * @param {string} name - Factory name
     * @returns {*} The result of the factory function
     */
    resolveFactory(name) {
        const factoryReg = this.factories.get(name);
        const dependencies = this.resolveDependencies(factoryReg.dependencies);
        return factoryReg.factory(...dependencies);
    }

    /**
     * Resolve an array of dependencies
     * @param {string[]} dependencyNames - Array of dependency names
     * @returns {*[]} Array of resolved dependencies
     */
    resolveDependencies(dependencyNames) {
        return dependencyNames.map(depName => this.resolve(depName));
    }

    /**
     * Check if a service is registered
     * @param {string} name - Service name
     * @returns {boolean} True if service is registered
     */
    has(name) {
        return this.services.has(name) || this.factories.has(name);
    }

    /**
     * Get all registered service names
     * @returns {string[]} Array of service names
     */
    getServiceNames() {
        if (this.isDestroyed) {
            return [];
        }

        return [
            ...Array.from(this.services.keys()),
            ...Array.from(this.factories.keys())
        ];
    }

    /**
     * Create a child container that inherits from this container
     * @returns {DependencyContainer} Child container
     */
    createChildContainer() {
        const child = new DependencyContainer();
        child.parent = this;
        return child;
    }

    /**
     * Try to resolve from parent container if service not found locally
     * @param {string} name - Service name
     * @returns {*|null} Service instance or null if not found
     */
    tryResolveFromParent(name) {
        if (this.parent && this.parent.has(name)) {
            return this.parent.resolve(name);
        }
        return null;
    }

    /**
     * Dispose of a specific service instance
     * @param {string} name - Service name
     */
    dispose(name) {
        if (this.services.has(name)) {
            const registration = this.services.get(name);
            if (registration.instance && typeof registration.instance.destroy === 'function') {
                registration.instance.destroy();
            }
            registration.instance = null;
        }
    }

    /**
     * Reset the container, disposing all singleton instances
     */
    reset() {
        // Dispose all singleton instances
        for (const [name, registration] of this.services.entries()) {
            if (registration.singleton && registration.instance) {
                if (typeof registration.instance.destroy === 'function') {
                    try {
                        registration.instance.destroy();
                    } catch (error) {
                        console.error(`Error destroying service '${name}':`, error);
                    }
                }
                registration.instance = null;
            }
        }

        // Clear singletons map
        this.singletons.clear();
    }

    /**
     * Destroy the container and all its services
     */
    destroy() {
        this.reset();
        this.services.clear();
        this.factories.clear();
        this.isDestroyed = true;
    }
}

// ES Module export
export default DependencyContainer;

// CommonJS compatibility
if (typeof window !== 'undefined') {
    window.DependencyContainer = DependencyContainer;
}