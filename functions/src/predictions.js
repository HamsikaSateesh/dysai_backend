const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { predictPainWithML } = require('./ml/painPredictor');

// Function to predict pain levels
exports.predictPain = functions.https.onCall(async (data, context) => {
  // Validate authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = context.auth.uid;
  const { useML = true } = data;
  
  try {
    // Use Random Forest ML prediction if enough data is available and ML is requested
    if (useML) {
      const mlPredictions = await predictPainWithML(userId);
      
      return {
        success: true,
        ...mlPredictions,
        modelType: 'randomForest',
        confidence: mlPredictions.predictionQuality >= 7 ? "high" : 
                   mlPredictions.predictionQuality >= 4 ? "medium" : "low"
      };
    } else {
      // Fallback to simple prediction if ML is not requested
      // Get user document
      const userDoc = await admin.firestore().collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
      }
      
      const userData = userDoc.data();
      const painPatterns = userData.painPatterns || {};
      const avgCycleLength = userData.cycleInfo?.averageCycleLength || 28;
      
      // Generate predictions
      const predictions = {};
      const highPainDays = [];
      const mediumPainDays = [];
      
      for (let day = 1; day <= 35; day++) {
        const dayKey = `day${day}`;
        let painLevel = 0;
        
        if (painPatterns[dayKey]) {
          // Use stored prediction if available
          painLevel = Math.round(painPatterns[dayKey]);
        } else {
          // Interpolate from neighboring days if data missing
          const prevDay = `day${day - 1}`;
          const nextDay = `day${day + 1}`;
          
          if (painPatterns[prevDay] && painPatterns[nextDay]) {
            painLevel = Math.round((painPatterns[prevDay] + painPatterns[nextDay]) / 2);
          } else if (painPatterns[prevDay]) {
            painLevel = Math.round(painPatterns[prevDay] * 0.9);
          } else if (painPatterns[nextDay]) {
            painLevel = Math.round(painPatterns[nextDay] * 0.9);
          }
        }
        
        predictions[dayKey] = painLevel;
        
        // Categorize pain days
        if (painLevel >= 7) {
          highPainDays.push(day);
        } else if (painLevel >= 4) {
          mediumPainDays.push(day);
        }
      }
      
      // Calculate confidence level based on data quantity
      const dataPoints = Object.keys(painPatterns).length;
      let confidence = "low";
      if (dataPoints > 20) {
        confidence = "high";
      } else if (dataPoints > 10) {
        confidence = "medium";
      }
      
      return {
        success: true,
        predictions: predictions,
        highPainDays: highPainDays,
        mediumPainDays: mediumPainDays,
        predictionQuality: Math.min(6, Math.max(1, dataPoints / 5)), // 1-6 scale
        predictedCycleLength: avgCycleLength,
        confidence: confidence,
        modelType: 'simple'
      };
    }
  } catch (error) {
    console.error('Error predicting pain levels:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});