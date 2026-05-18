import { Mixpanel } from 'mixpanel-react-native';

// Shared Mixpanel singleton — avoids creating new instances on every render
// NOTE: Do NOT call mixpanel.init() here. init() is called explicitly
// from App.tsx after reset()/clearSuperProperties() to avoid race conditions.
const mixpanel = new Mixpanel('f88f7a27585868c53b1e08c06f5226bd', false);

export default mixpanel;
