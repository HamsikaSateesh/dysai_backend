/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Import functions from feature modules
const cyclesFunctions = require('./src/cycles');
const symptomsFunctions = require('./src/symptoms');
const predictionsFunctions = require('./src/predictions');

// Import functions from feature modules
const moodGardenFunctions = require('./src/moodGarden');
const wellnessFunctions = require('./src/wellness');
const settingsFunctions = require('./src/settings');
const adminFunctions = require('./src/admin');
const userFunctions = require('./src/users');

// Export Mood Garden functions
exports.logMoodEntry = moodGardenFunctions.logMoodEntry;
exports.getMoodGarden = moodGardenFunctions.getMoodGarden;

// Export Wellness Activities functions
exports.getDailyTips = wellnessFunctions.getDailyTips;
exports.completeWellnessActivity = wellnessFunctions.completeWellnessActivity;
exports.getWellnessStats = wellnessFunctions.getWellnessStats;

// Export Settings Management functions
exports.updateSettings = settingsFunctions.updateSettings;
exports.getSettings = settingsFunctions.getSettings;

// Export Admin functions
exports.addTip = adminFunctions.addTip;
exports.loadInitialTips = adminFunctions.loadInitialTips;

// Export cycle tracking functions
exports.startCycle = cyclesFunctions.startCycle;
exports.endCycle = cyclesFunctions.endCycle;

// Export symptom logging functions
exports.logSymptom = symptomsFunctions.logSymptom;

// Export prediction functions
exports.predictPain = predictionsFunctions.predictPain;
exports.updatePredictionsDaily = predictionsFunctions.updatePredictionsDaily;

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
