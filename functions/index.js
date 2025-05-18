// functions/index.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Import ML functions
const painPredictorFunctions = require('./src/ml/painPredictor');
const syntheticDataFunctions = require('./src/ml/syntheticDataGenerator');
const cyclesFunctions = require('./src/ml/cycles');
const moodGardenFunctions = require('./src/ml/moodGarden');
const predictionsFunctions = require('./src/ml/predictions');
const settingsFunctions = require('./src/ml/settings');
const symptomsFunctions = require('./src/ml/symptoms');
const usersFunctions = require('./src/ml/users');
const wellnessFunctions = require('./src/ml/wellness');

// Export Cycles functions
exports.startCycle = cyclesFunctions.startCycle;
exports.endCycle = cyclesFunctions.endCycle;
exports.getCycleHistory = cyclesFunctions.getCycleHistory;
exports.getCurrentCycleStats = cyclesFunctions.getCurrentCycleStats;

// Export Mood Garden functions
exports.logMoodEntry = moodGardenFunctions.logMoodEntry;
exports.getMoodGarden = moodGardenFunctions.getMoodGarden;

// Export Pain Prediction functions
exports.getPainPredictions = predictionsFunctions.getPainPredictions;
exports.ratePredictionAccuracy = predictionsFunctions.ratePredictionAccuracy;
exports.updatePredictionModels = predictionsFunctions.updatePredictionModels;

// Export Settings functions
exports.updateSettings = settingsFunctions.updateSettings;
exports.getSettings = settingsFunctions.getSettings;

// Export Symptoms functions
exports.logSymptom = symptomsFunctions.logSymptom;
exports.getSymptomHistory = symptomsFunctions.getSymptomHistory;
exports.analyzeSymptoms = symptomsFunctions.analyzeSymptoms;

// Export User functions
exports.updateUserProfile = usersFunctions.updateUserProfile;
exports.getUserProfile = usersFunctions.getUserProfile;
exports.recordBiosensorData = usersFunctions.recordBiosensorData;
exports.trackMeditationSession = usersFunctions.trackMeditationSession;

// Export Wellness functions
exports.getDailyTips = wellnessFunctions.getDailyTips;
exports.completeWellnessActivity = wellnessFunctions.completeWellnessActivity;
exports.getWellnessStats = wellnessFunctions.getWellnessStats;
exports.addWellnessTip = wellnessFunctions.addWellnessTip;
exports.loadInitialTips = wellnessFunctions.loadInitialTips;

// Export Synthetic Data functions for admin use
exports.generateAndStoreSyntheticDataset = syntheticDataFunctions.generateAndStoreSyntheticDataset;