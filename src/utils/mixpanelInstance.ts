import { Mixpanel } from 'mixpanel-react-native';

// Shared Mixpanel singleton — avoids creating new instances on every render
// NOTE: Do NOT call mixpanel.init() here. init() is called explicitly
// from App.tsx after reset()/clearSuperProperties() to avoid race conditions.
const mixpanel = new Mixpanel('b5c43b5eeefef8db948f6bf391e5ce39', false);

export default mixpanel;
