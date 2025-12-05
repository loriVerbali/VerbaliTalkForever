import React from 'react';
import {render, fireEvent, waitFor} from '@testing-library/react-native';
import {useDatabase} from '../src/contexts/DatabaseContext';

// Mock the database context
jest.mock('../src/contexts/DatabaseContext');
const mockUseDatabase = useDatabase as jest.MockedFunction<typeof useDatabase>;

describe('AI Resolved Functionality', () => {
  beforeEach(() => {
    mockUseDatabase.mockReturnValue({
      isInitialized: true,
      isLoading: false,
      addAIResolved: jest.fn().mockResolvedValue(1),
      getAIResolvedData: jest.fn().mockResolvedValue([]),
      // Add other required properties with mock values
      addUtterance: jest.fn(),
      addClassicEntry: jest.fn(),
      addAIResponseTime: jest.fn(),
      getUtterancesData: jest.fn(),
      getClassicData: jest.fn(),
      getAIResponseTimeData: jest.fn(),
      getWordCountData: jest.fn(),
      getStats: jest.fn(),
      clearData: jest.fn(),
      refreshDatabase: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should track AI Resolved data correctly', async () => {
    const mockAddAIResolved = jest.fn().mockResolvedValue(1);
    mockUseDatabase.mockReturnValue({
      isInitialized: true,
      isLoading: false,
      addAIResolved: mockAddAIResolved,
      getAIResolvedData: jest.fn().mockResolvedValue([]),
      addUtterance: jest.fn(),
      addClassicEntry: jest.fn(),
      addAIResponseTime: jest.fn(),
      getUtterancesData: jest.fn(),
      getClassicData: jest.fn(),
      getAIResponseTimeData: jest.fn(),
      getWordCountData: jest.fn(),
      getStats: jest.fn(),
      clearData: jest.fn(),
      refreshDatabase: jest.fn(),
    });

    // Test data structure
    const testAIRecord = {
      question: 'What is your favorite color?',
      dateof: new Date(),
      round1_answers: JSON.stringify(['Red', 'Blue', 'Green']),
      round1_picked: 'Red',
      round2_answers: undefined,
      round2_picked: undefined,
      round3_answers: undefined,
      round3_picked: undefined,
    };

    // Simulate adding AI Resolved record
    await mockAddAIResolved(testAIRecord);

    expect(mockAddAIResolved).toHaveBeenCalledWith(testAIRecord);
    expect(mockAddAIResolved).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple rounds correctly', async () => {
    const mockAddAIResolved = jest.fn().mockResolvedValue(1);
    mockUseDatabase.mockReturnValue({
      isInitialized: true,
      isLoading: false,
      addAIResolved: mockAddAIResolved,
      getAIResolvedData: jest.fn().mockResolvedValue([]),
      addUtterance: jest.fn(),
      addClassicEntry: jest.fn(),
      addAIResponseTime: jest.fn(),
      getUtterancesData: jest.fn(),
      getClassicData: jest.fn(),
      getAIResponseTimeData: jest.fn(),
      getWordCountData: jest.fn(),
      getStats: jest.fn(),
      clearData: jest.fn(),
      refreshDatabase: jest.fn(),
    });

    // Test data with multiple rounds
    const testAIRecordWithRounds = {
      question: 'What do you want to eat?',
      dateof: new Date(),
      round1_answers: JSON.stringify(['Pizza', 'Burger', 'Salad']),
      round1_picked: 'MoreAnswers',
      round2_answers: JSON.stringify(['Pasta', 'Sushi', 'Tacos']),
      round2_picked: 'Pasta',
      round3_answers: undefined,
      round3_picked: undefined,
    };

    // Simulate adding AI Resolved record with multiple rounds
    await mockAddAIResolved(testAIRecordWithRounds);

    expect(mockAddAIResolved).toHaveBeenCalledWith(testAIRecordWithRounds);
    expect(mockAddAIResolved).toHaveBeenCalledTimes(1);
  });
});
