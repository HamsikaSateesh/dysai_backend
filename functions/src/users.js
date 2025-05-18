// functions/src/ml/users.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { authenticateUser } = require('./ml/utils');

// Function to create or update user profile
exports.updateUserProfile = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    // If profile exists, only update provided fields
    if (userDoc.exists) {
      const updateData = {};
      
      // Only update fields that are provided
      if (data.fullName !== undefined) updateData.fullName = data.fullName;
      if (data.birthDate !== undefined) {
        // Convert string date to Firestore timestamp
        updateData.birthDate = admin.firestore.Timestamp.fromDate(new Date(data.birthDate));
      }
      
      // Update any specific fields from cycleInfo if provided
      if (data.cycleInfo) {
        if (data.cycleInfo.lastPeriodDate) {
          updateData['cycleInfo.lastPeriodDate'] = admin.firestore.Timestamp.fromDate(
            new Date(data.cycleInfo.lastPeriodDate)
          );
        }
        if (data.cycleInfo.averageCycleLength !== undefined) {
          updateData['cycleInfo.averageCycleLength'] = data.cycleInfo.averageCycleLength;
        }
        if (data.cycleInfo.averagePeriodLength !== undefined) {
          updateData['cycleInfo.averagePeriodLength'] = data.cycleInfo.averagePeriodLength;
        }
      }
      
      // Add updated timestamp
      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      
      await userRef.update(updateData);
      
      return {
        success: true,
        message: 'Profile updated successfully',
        userId: userId
      };
    } 
    // Create new profile if it doesn't exist
    else {
      // Prepare initial user data
      const userData = {
        email: context.auth.token.email || '',
        fullName: data.fullName || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Add birthdate if provided
      if (data.birthDate) {
        userData.birthDate = admin.firestore.Timestamp.fromDate(new Date(data.birthDate));
      }
      
      // Initialize cycleInfo if provided
      if (data.cycleInfo) {
        userData.cycleInfo = {
          averageCycleLength: data.cycleInfo.averageCycleLength || 28,
          averagePeriodLength: data.cycleInfo.averagePeriodLength || 5,
          painPatterns: data.cycleInfo.painPatterns || {}
        };
        
        // Add last period date if provided
        if (data.cycleInfo.lastPeriodDate) {
          userData.cycleInfo.lastPeriodDate = admin.firestore.Timestamp.fromDate(
            new Date(data.cycleInfo.lastPeriodDate)
          );
        }
      }
      
      // Initialize empty arrays and maps for other data
      userData.wellnessActivities = [];
      userData.biosensorData = [];
      userData.settings = {
        notificationPreferences: {},
        heatTherapyEnabled: false,
        gamificationEnabled: true
      };
      userData.moodGarden = {
        totalPlants: 0,
        plants: []
      };
      userData.meditationProgress = {
        totalSessions: 0
      };
      
      await userRef.set(userData);
      
      return {
        success: true,
        message: 'Profile created successfully',
        userId: userId
      };
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to get user profile
exports.getUserProfile = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const userData = userDoc.data();
    
    // Format timestamps for client usage
    const formattedData = {
      ...userData,
      createdAt: userData.createdAt ? userData.createdAt.toDate().toISOString() : null,
      updatedAt: userData.updatedAt ? userData.updatedAt.toDate().toISOString() : null
    };
    
    // Format cycleInfo timestamps
    if (userData.cycleInfo && userData.cycleInfo.lastPeriodDate) {
      formattedData.cycleInfo.lastPeriodDate = userData.cycleInfo.lastPeriodDate.toDate().toISOString();
    }
    
    // Format meditation session timestamps
    if (userData.meditationProgress && userData.meditationProgress.lastSessionDate) {
      formattedData.meditationProgress.lastSessionDate = 
        userData.meditationProgress.lastSessionDate.toDate().toISOString();
    }
    
    // Format timestamps in wellness activities
    if (Array.isArray(userData.wellnessActivities)) {
      formattedData.wellnessActivities = userData.wellnessActivities.map(activity => ({
        ...activity,
        date: activity.date ? activity.date.toDate().toISOString() : null
      }));
    }
    
    // Format timestamps in mood garden plants
    if (userData.moodGarden && Array.isArray(userData.moodGarden.plants)) {
      formattedData.moodGarden.plants = userData.moodGarden.plants.map(plant => ({
        ...plant,
        plantedAt: plant.plantedAt ? plant.plantedAt.toDate().toISOString() : null
      }));
    }
    
    // Format timestamps in biosensor data
    if (Array.isArray(userData.biosensorData)) {
      formattedData.biosensorData = userData.biosensorData.map(data => ({
        ...data,
        date: data.date ? data.date.toDate().toISOString() : null
      }));
    }
    
    return {
      success: true,
      profile: formattedData
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to record biosensor data
exports.recordBiosensorData = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  try {
    const { painLevelDetected, bodyTemperature, heartRate, otherSensorMetrics, date } = data;
    
    // Validate minimum required data
    if (painLevelDetected === undefined && bodyTemperature === undefined && 
        heartRate === undefined) {
      throw new functions.https.HttpsError(
        'invalid-argument', 
        'At least one biosensor metric is required'
      );
    }
    
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const recordDate = date ? new Date(date) : new Date();
    
    // Create biosensor data entry
    const sensorData = {
      date: admin.firestore.Timestamp.fromDate(recordDate)
    };
    
    // Add provided metrics
    if (painLevelDetected !== undefined) sensorData.painLevelDetected = painLevelDetected;
    if (bodyTemperature !== undefined) sensorData.bodyTemperature = bodyTemperature;
    if (heartRate !== undefined) sensorData.heartRate = heartRate;
    if (otherSensorMetrics) sensorData.otherSensorMetrics = otherSensorMetrics;
    
    // Update user's biosensor data array
    await userRef.update({
      biosensorData: admin.firestore.FieldValue.arrayUnion(sensorData),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      recordedAt: recordDate.toISOString()
    };
  } catch (error) {
    console.error('Error recording biosensor data:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to track meditation session
exports.trackMeditationSession = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  try {
    const { meditationId, durationMinutes, date } = data;
    
    if (!meditationId || !durationMinutes) {
      throw new functions.https.HttpsError(
        'invalid-argument', 
        'Meditation ID and duration are required'
      );
    }
    
    const db = admin.firestore();
    
    // Verify meditation exists
    const meditationDoc = await db.collection('meditations').doc(meditationId).get();
    if (!meditationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Meditation not found');
    }
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const userData = userDoc.data();
    const sessionDate = date ? new Date(date) : new Date();
    
    // Update meditation progress
    const meditationProgress = userData.meditationProgress || {
      totalSessions: 0
    };
    
    meditationProgress.totalSessions += 1;
    meditationProgress.lastSessionDate = admin.firestore.Timestamp.fromDate(sessionDate);
    
    // Log this meditation session
    const sessionRef = await db.collection('users').doc(userId).collection('meditation_sessions').add({
      meditationId: meditationId,
      title: meditationDoc.data().title,
      durationMinutes: durationMinutes,
      date: admin.firestore.Timestamp.fromDate(sessionDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update user document
    await userRef.update({
      meditationProgress: meditationProgress,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      totalSessions: meditationProgress.totalSessions,
      sessionId: sessionRef.id
    };
  } catch (error) {
    console.error('Error tracking meditation session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

module.exports = {
  updateUserProfile,
  getUserProfile,
  recordBiosensorData,
  trackMeditationSession
};