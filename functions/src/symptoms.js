// functions/src/ml/symptoms.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { authenticateUser } = require('./ml/utils');

// Function to log a symptom
exports.logSymptom = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  const { cycleId, symptomType, intensity, date, notes } = data;
  
  // Validate required fields
  if (!symptomType || !intensity || intensity < 1 || intensity > 10) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'Symptom type and intensity (1-10) are required'
    );
  }
  
  try {
    const db = admin.firestore();
    let targetCycleId = cycleId;
    
    // If no cycleId provided, use current cycle
    if (!targetCycleId) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
      }
      
      const userData = userDoc.data();
      targetCycleId = userData.currentCycleId;
      
      if (!targetCycleId) {
        throw new functions.https.HttpsError('failed-precondition', 'No active cycle found');
      }
    }
    
    const symptomDate = date ? new Date(date) : new Date();
    
    // Create symptom object
    const symptom = {
      type: symptomType,
      intensity: parseInt(intensity),
      date: admin.firestore.Timestamp.fromDate(symptomDate),
      notes: notes || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Add to cycle's symptoms array
    const cycleRef = db.collection('users').doc(userId).collection('cycles').doc(targetCycleId);
    await cycleRef.update({
      symptoms: admin.firestore.FieldValue.arrayUnion(symptom),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Also store in separate symptoms collection for easier querying
    const symptomRef = await db.collection('users').doc(userId).collection('symptoms').add({
      ...symptom,
      cycleId: targetCycleId
    });
    
    // Update pain patterns in user document for prediction
    await updatePainPatterns(userId, symptomType, intensity, symptomDate);
    
    return { 
      success: true,
      symptomId: symptomRef.id
    };
  } catch (error) {
    console.error('Error logging symptom:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Helper function to update pain patterns
async function updatePainPatterns(userId, symptomType, intensity, date) {
  try {
    // Only track pain-related symptoms
    const painSymptoms = ['cramps', 'headache', 'backache', 'abdominal_pain'];
    if (!painSymptoms.includes(symptomType)) {
      return;
    }
    
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return;
    }
    

    const userData = userDoc.data();
    const lastPeriodStart = userData.cycleInfo?.lastPeriodDate?.toDate();
    
    if (!lastPeriodStart) {
      return;
    }
    
    // Calculate which day of cycle this is
    const symptomDate = date;
    const diffTime = Math.abs(symptomDate - lastPeriodStart);
    const cycleDay = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Don't update if day is unreasonable
    if (cycleDay > 35) {
      return;
    }
    
    // Update pain pattern for this day
    const painPatterns = userData.cycleInfo?.painPatterns || {};
    const dayKey = `day${cycleDay}`;
    
    // Use exponential weighted moving average to update pain prediction
    const alpha = 0.3; // Weighting factor
    const currentValue = painPatterns[dayKey] || 0;
    const newValue = currentValue * (1 - alpha) + intensity * alpha;
    
    // Create update object
    const updates = {};
    updates[`cycleInfo.painPatterns.${dayKey}`] = newValue;
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    // Update user document
    await userRef.update(updates);
  } catch (error) {
    console.error('Error updating pain patterns:', error);
    // Don't throw - this is a background process
  }
}

// Function to get symptom history
exports.getSymptomHistory = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  const { 
    symptomType, 
    limit = 50, 
    startDate, 
    endDate 
  } = data;
  
  try {
    const db = admin.firestore();
    let query = db.collection('users').doc(userId).collection('symptoms');
    
    // Apply filters if provided
    if (symptomType) {
      query = query.where('type', '==', symptomType);
    }
    
    // Add date filters if provided
    if (startDate) {
      const startTimestamp = admin.firestore.Timestamp.fromDate(new Date(startDate));
      query = query.where('date', '>=', startTimestamp);
    }
    
    if (endDate) {
      const endTimestamp = admin.firestore.Timestamp.fromDate(new Date(endDate));
      query = query.where('date', '<=', endTimestamp);
    }
    
    // Order and limit
    query = query.orderBy('date', 'desc').limit(limit);
    
    const symptomsSnapshot = await query.get();
    
    const symptoms = [];
    symptomsSnapshot.forEach(doc => {
      const symptomData = doc.data();
      symptoms.push({
        id: doc.id,
        type: symptomData.type,
        intensity: symptomData.intensity,
        date: symptomData.date.toDate().toISOString(),
        notes: symptomData.notes,
        cycleId: symptomData.cycleId
      });
    });
    
    return {
      success: true,
      symptoms
    };
  } catch (error) {
    console.error('Error getting symptom history:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Function to analyze symptoms
exports.analyzeSymptoms = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  try {
    const db = admin.firestore();
    
    // Get user's symptoms
    const symptomsSnapshot = await db.collection('users').doc(userId)
      .collection('symptoms')
      .orderBy('date', 'desc')
      .limit(200) // Analyze recent symptoms
      .get();
    
    // Group symptoms by type
    const symptomsByType = {};
    const symptomsByDay = {};
    let totalSymptoms = 0;
    
    symptomsSnapshot.forEach(doc => {
      const symptom = doc.data();
      totalSymptoms++;
      
      // Group by type
      if (!symptomsByType[symptom.type]) {
        symptomsByType[symptom.type] = {
          count: 0,
          totalIntensity: 0,
          symptoms: []
        };
      }
      
      symptomsByType[symptom.type].count++;
      symptomsByType[symptom.type].totalIntensity += symptom.intensity;
      symptomsByType[symptom.type].symptoms.push(symptom);
      
      // Group by day of cycle
      if (symptom.cycleId) {
        // We'll process this below after getting cycle info
      }
    });
    
    // Calculate average intensity by type
    const symptomAnalysis = {};
    Object.keys(symptomsByType).forEach(type => {
      const data = symptomsByType[type];
      symptomAnalysis[type] = {
        count: data.count,
        percentage: Math.round((data.count / totalSymptoms) * 100),
        averageIntensity: Math.round((data.totalIntensity / data.count) * 10) / 10
      };
    });
    
    // Get cycle data to analyze symptoms by cycle day
    const cyclesSnapshot = await db.collection('users').doc(userId)
      .collection('cycles')
      .orderBy('startDate', 'desc')
      .limit(6)
      .get();
    
    const cycles = [];
    cyclesSnapshot.forEach(doc => {
      cycles.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Map symptoms to cycle days
    const cycleMap = {};
    cycles.forEach(cycle => {
      cycleMap[cycle.id] = cycle;
    });
    
    // Process symptoms by cycle day
    symptomsSnapshot.forEach(doc => {
      const symptom = doc.data();
      
      if (symptom.cycleId && cycleMap[symptom.cycleId]) {
        const cycle = cycleMap[symptom.cycleId];
        const cycleStartDate = cycle.startDate.toDate();
        const symptomDate = symptom.date.toDate();
        
        // Calculate day of cycle
        const diffTime = Math.abs(symptomDate - cycleStartDate);
        const dayOfCycle = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (dayOfCycle <= 35) { // Only count reasonable days
          const dayKey = `day${dayOfCycle}`;
          
          if (!symptomsByDay[dayKey]) {
            symptomsByDay[dayKey] = {
              count: 0,
              totalIntensity: 0,
              byType: {}
            };
          }
          
          symptomsByDay[dayKey].count++;
          symptomsByDay[dayKey].totalIntensity += symptom.intensity;
          
          // Also track by type within day
          if (!symptomsByDay[dayKey].byType[symptom.type]) {
            symptomsByDay[dayKey].byType[symptom.type] = {
              count: 0,
              totalIntensity: 0
            };
          }
          
          symptomsByDay[dayKey].byType[symptom.type].count++;
          symptomsByDay[dayKey].byType[symptom.type].totalIntensity += symptom.intensity;
        }
      }
    });
    
    // Calculate averages by day
    const dayAnalysis = {};
    Object.keys(symptomsByDay).forEach(dayKey => {
      const data = symptomsByDay[dayKey];
      
      const typeAnalysis = {};
      Object.keys(data.byType).forEach(type => {
        const typeData = data.byType[type];
        typeAnalysis[type] = {
          count: typeData.count,
          averageIntensity: Math.round((typeData.totalIntensity / typeData.count) * 10) / 10
        };
      });
      
      dayAnalysis[dayKey] = {
        count: data.count,
        averageIntensity: Math.round((data.totalIntensity / data.count) * 10) / 10,
        byType: typeAnalysis
      };
    });
    
    return {
      success: true,
      totalSymptoms,
      symptomsByType: symptomAnalysis,
      symptomsByDay: dayAnalysis
    };
  } catch (error) {
    console.error('Error analyzing symptoms:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

module.exports = {
  logSymptom,
  getSymptomHistory,
  analyzeSymptoms
};