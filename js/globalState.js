const globalState = {
    currentView: { type: 'broad', category: null, subcategory: null, node: null },
    updateCallbacks: [],

    subscribe(callback) {
        this.updateCallbacks.push(callback);
    },

    notify() {
        this.updateCallbacks.forEach(callback => callback(this.currentView));
    },

    update(newState) {
        this.currentView = { ...this.currentView, ...newState };
        this.notify();
    }
};

export default globalState;
