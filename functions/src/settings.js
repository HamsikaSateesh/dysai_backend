// functions/src/ml/settings.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { authenticateUser } = require('./ml/utils');

// Function to update user settings
exports.updateSettings = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  const { notificationPreferences, heatTherapyEnabled, gamificationEnabled } = data;
  
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const updates = {};
    
    // Only update fields that were provided
    if (notificationPreferences !== undefined) {
      updates['settings.notificationPreferences'] = notificationPreferences;
    }
    
    if (heatTherapyEnabled !== undefined) {
      updates['settings.heatTherapyEnabled'] = heatTherapyEnabled;
    }
    
    if (gamificationEnabled !== undefined) {
      updates['settings.gamificationEnabled'] = gamificationEnabled;
    }
    
    // Add timestamp
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    await userRef.update(updates);
    
    return {
      success: true,
      updated: Object.keys(updates).filter(key => key !== 'updatedAt')
    };
  } catch (error) {
    console.error('Error updating settings:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to get user settings
exports.getSettings = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const userData = userDoc.data();
    
    // Default settings if not set
    const settings = userData.settings || {
      notificationPreferences: {},
      heatTherapyEnabled: false,
      gamificationEnabled: true
    };
    
    return {
      success: true,
      settings
    };
  } catch (error) {
    console.error('Error getting settings:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

module.exports = {
  updateSettings,
  getSettings
};