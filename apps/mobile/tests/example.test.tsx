/**
 * Example test to verify mobile test infrastructure is working.
 * Tests a minimal React Native Text component render.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('Mobile test infrastructure', () => {
  it('renders a Text component', () => {
    const { getByText } = render(<Text>DriveCommand Mobile</Text>);
    expect(getByText('DriveCommand Mobile')).toBeTruthy();
  });

  it('confirms testing library is set up correctly', () => {
    const { getByText } = render(<Text testID="test-text">Hello World</Text>);
    const element = getByText('Hello World');
    expect(element).toBeTruthy();
  });
});
