import {createNavigationContainerRef} from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export const navigate = (name: string, params?: Record<string, any>) => {
  if (navigationRef.isReady()) {
    // Cast to any to avoid generic param issues from non-component code
    (navigationRef as any).navigate(name, params);
  }
};
