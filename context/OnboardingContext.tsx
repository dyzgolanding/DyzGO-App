import { createContext, useContext } from 'react';

interface OnboardingContextType {
  setNeedsOnboarding: (value: boolean) => void;
}

export const OnboardingContext = createContext<OnboardingContextType>({
  setNeedsOnboarding: () => {},
});

export const useOnboarding = () => useContext(OnboardingContext);
