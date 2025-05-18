// functions/src/ml/cycles.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { authenticateUser } = require('./ml/utils');

// Function to start a new cycle
exports.startCycle = functions.https.onCall(async (data, context) => {
  // Authenticate user
  const userId = authenticateUser(context);
  
  const { startDate, symptoms, notes } = data;
  
  try {
    // Get user's average cycle length
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const userData = userDoc.data();
    const avgCycleLength = userData.cycleInfo?.averageCycleLength || 28;
    
    // Calculate predicted end date
    const startDateObj = new Date(startDate);
    const predictedEndDate = new Date(startDateObj);
    predictedEndDate.setDate(predictedEndDate.getDate() + avgCycleLength);
    
    // Create cycle document
    const cycleData = {
      startDate: admin.firestore.Timestamp.fromDate(startDateObj),
      endDate: null,
      predictedEndDate: admin.firestore.Timestamp.fromDate(predictedEndDate),
      duration: null,
      symptoms: symptoms || [],
      notes: notes || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Add to database
    const cycleRef = await admin.firestore().collection('users').doc(userId).collection('cycles').add(cycleData);
    
    // Update user's current cycle reference
    await admin.firestore().collection('users').doc(userId).update({
      'cycleInfo.lastPeriodDate': cycleData.startDate,
      currentCycleId: cycleRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { 
      success: true, 
      cycleId: cycleRef.id, 
      predictedEndDate: predictedEndDate.toISOString() 
    };
  } catch (error) {
    console.error('Error starting cycle:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to end the current cycle
exports.endCycle = functions.https.onCall(async (data, context) => {
  // Authenticate user
  const userId = authenticateUser(context);
  
  const { endDate, cycleId } = data;
  
  try {
    let targetCycleId = cycleId;
    
    if (!targetCycleId) {
      // If no cycle ID provided, find the current cycle from user data
      const userDoc = await admin.firestore().collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
      }
      
      const userData = userDoc.data();
      if (!userData.currentCycleId) {
        throw new functions.https.HttpsError('failed-precondition', 'No active cycle found');
      }
      
      targetCycleId = userData.currentCycleId;
    }
    
    // Get the cycle document
    const cycleRef = admin.firestore().collection('users').doc(userId).collection('cycles').doc(targetCycleId);
    const cycleDoc = await cycleRef.get();
    
    if (!cycleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Cycle not found');
    }
    
    const cycleData = cycleDoc.data();
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = cycleData.startDate.toDate();
    
    // Calculate duration in days
    const diffTime = Math.abs(endDateObj - startDateObj);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Update cycle document
    await cycleRef.update({
      endDate: admin.firestore.Timestamp.fromDate(endDateObj),
      duration: diffDays,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update average cycle length calculation
    const cyclesQuery = await admin.firestore().collection('users').doc(userId)
      .collection('cycles')
      .where('duration', '>', 0)
      .orderBy('duration')
      .orderBy('startDate', 'desc')
      .limit(6)
      .get();
    
    let totalDuration = 0;
    let cycleCount = 0;
    
    cyclesQuery.forEach(doc => {
      totalDuration += doc.data().duration;
      cycleCount++;
    });
    
    const newAvgCycleLength = cycleCount > 0 ? Math.round(totalDuration / cycleCount) : 28;
    
    // Update user document
    await admin.firestore().collection('users').doc(userId).update({
      currentCycleId: null,
      'cycleInfo.averageCycleLength': newAvgCycleLength,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      cycleLength: diffDays,
      newAverageCycleLength: newAvgCycleLength
    };
  } catch (error) {
    console.error('Error ending cycle:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to get cycle history
exports.getCycleHistory = functions.https.onCall(async (data, context) => {
  // Authenticate user
  const userId = authenticateUser(context);
  
  const { limit = 12 } = data;
  
  try {
    // Get cycle documents
    const cyclesQuery = await admin.firestore().collection('users').doc(userId)
      .collection('cycles')
      .orderBy('startDate', 'desc')
      .limit(limit)
      .get();
    
    const cycles = [];
    cyclesQuery.forEach(doc => {
      const cycleData = doc.data();
      cycles.push({
        id: doc.id,
        startDate: cycleData.startDate.toDate().toISOString(),
        endDate: cycleData.endDate ? cycleData.endDate.toDate().toISOString() : null,
        predictedEndDate: cycleData.predictedEndDate ? cycleData.predictedEndDate.toDate().toISOString() : null,
        duration: cycleData.duration,
        notes: cycleData.notes,
        symptoms: cycleData.symptoms.map(symptom => ({
          ...symptom,
          date: symptom.date ? symptom.date.toDate().toISOString() : null
        }))
      });
    });
    
    return { 
      success: true, 
      cycles 
    };
  } catch (error) {
    console.error('Error getting cycle history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to get current cycle stats
exports.getCurrentCycleStats = functions.https.onCall(async (data, context) => {
  // Authenticate user
  const userId = authenticateUser(context);
  
  try {
    // Get user document
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const userData = userDoc.data();
    
    // If no current cycle, return cycle info only
    if (!userData.currentCycleId) {
      return {
        success: true,
        hasCycle: false,
        cycleInfo: {
          averageCycleLength: userData.cycleInfo?.averageCycleLength || 28,
          averagePeriodLength: userData.cycleInfo?.averagePeriodLength || 5,
          lastPeriodDate: userData.cycleInfo?.lastPeriodDate ? 
            userData.cycleInfo.lastPeriodDate.toDate().toISOString() : null
        }
      };
    }
    
    // Get current cycle
    const cycleDoc = await admin.firestore().collection('users').doc(userId)
      .collection('cycles')
      .doc(userData.currentCycleId)
      .get();
    
    if (!cycleDoc.exists) {
      // Inconsistent state, update user
      await admin.firestore().collection('users').doc(userId).update({
        currentCycleId: null
      });
      
      throw new functions.https.HttpsError('not-found', 'Current cycle not found');
    }
    
    const cycleData = cycleDoc.data();
    
    // Calculate current day of cycle
    const startDate = cycleData.startDate.toDate();
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate - startDate);
    const currentDay = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Get cycle phase
    let cyclePhase;
    const avgCycleLength = userData.cycleInfo?.averageCycleLength || 28;
    const avgPeriodLength = userData.cycleInfo?.averagePeriodLength || 5;
    
    if (currentDay <= avgPeriodLength) {
      cyclePhase = 'menstrual';
    } else if (currentDay <= 14) {
      cyclePhase = 'follicular';
    } else if (currentDay >= 14 && currentDay <= 16) {
      cyclePhase = 'ovulatory';
    } else {
      cyclePhase = 'luteal';
    }
    
    // Calculate days until next period
    let daysUntilNextPeriod;
    if (cycleData.predictedEndDate) {
      const predictedEndDate = cycleData.predictedEndDate.toDate();
      const diffToNextTime = predictedEndDate - currentDate;
      daysUntilNextPeriod = Math.ceil(diffToNextTime / (1000 * 60 * 60 * 24));
      
      // If negative or zero, cycle prediction might be off
      if (daysUntilNextPeriod <= 0) {
        daysUntilNextPeriod = null;
      }
    } else {
      // Fallback to average cycle length
      daysUntilNextPeriod = avgCycleLength - currentDay;
      if (daysUntilNextPeriod <= 0) {
        daysUntilNextPeriod = null;
      }
    }
    
    return {
      success: true,
      hasCycle: true,
      cycle: {
        id: cycleDoc.id,
        startDate: cycleData.startDate.toDate().toISOString(),
        predictedEndDate: cycleData.predictedEndDate ? 
          cycleData.predictedEndDate.toDate().toISOString() : null,
        currentDay,
        cyclePhase,
        daysUntilNextPeriod
      },
      cycleInfo: {
        averageCycleLength: userData.cycleInfo?.averageCycleLength || 28,
        averagePeriodLength: userData.cycleInfo?.averagePeriodLength || 5
      }
    };
  } catch (error) {
    console.error('Error getting current cycle stats:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

module.exports = {
  startCycle,
  endCycle,
  getCycleHistory,
  getCurrentCycleStats
};