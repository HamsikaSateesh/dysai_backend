// functions/src/ml/moodGarden.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { authenticateUser } = require('./ml/utils');

// Function to log a mood entry and update the mood garden
exports.logMoodEntry = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  const { moodScore, notes, date, completedActivities } = data;
  
  if (!moodScore || moodScore < 1 || moodScore > 10) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'Mood score must be between 1 and 10'
    );
  }
  
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const userData = userDoc.data();
    const moodDate = date ? new Date(date) : new Date();
    
    // Record completed wellness activities if any
    if (completedActivities && completedActivities.length > 0) {
      const wellnessActivities = userData.wellnessActivities || [];
      
      completedActivities.forEach(activity => {
        wellnessActivities.push({
          date: admin.firestore.Timestamp.fromDate(moodDate),
          activityType: activity.type,
          pointsEarned: activity.points || 5
        });
      });
      
      await userRef.update({
        wellnessActivities: wellnessActivities
      });
    }
    
    // Update user's mood garden based on mood score
    const moodGarden = userData.moodGarden || { totalPlants: 0, plants: [] };
    let shouldAddNewPlant = false;
    
    // Determine if we should add a new plant based on mood score and existing plants
    if (moodGarden.totalPlants === 0) {
      shouldAddNewPlant = true;
    } else {
      // Check if it's been at least 3 days since the last plant was added
      const mostRecentPlant = moodGarden.plants.reduce((latest, plant) => {
        const plantDate = plant.plantedAt.toDate();
        return latest === null || plantDate > latest.toDate() ? plant.plantedAt : latest;
      }, null);
      
      if (mostRecentPlant) {
        const daysSinceLastPlant = Math.floor(
          (moodDate - mostRecentPlant.toDate()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceLastPlant >= 3) {
          shouldAddNewPlant = true;
        }
      }
    }
    
    // Add a new plant if conditions are met
    if (shouldAddNewPlant) {
      const plantType = determinePlantType(moodScore);
      
      moodGarden.plants.push({
        plantType: plantType,
        plantedAt: admin.firestore.Timestamp.fromDate(moodDate),
        moodScore: moodScore
      });
      
      moodGarden.totalPlants += 1;
      
      await userRef.update({
        moodGarden: moodGarden
      });
      
      return {
        success: true,
        newPlant: {
          plantType: plantType,
          plantedAt: moodDate.toISOString(),
          moodScore: moodScore
        },
        totalPlants: moodGarden.totalPlants
      };
    }
    
    return {
      success: true,
      moodLogged: true,
      totalPlants: moodGarden.totalPlants
    };
  } catch (error) {
    console.error('Error logging mood:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Helper function to determine plant type based on mood score
function determinePlantType(moodScore) {
  // Different plant types based on mood score (1-10 scale)
  if (moodScore >= 8) {
    // Very positive mood - vibrant flowering plants
    const happyPlants = ['sunflower', 'tulip', 'rose', 'hibiscus', 'daisy'];
    return happyPlants[Math.floor(Math.random() * happyPlants.length)];
  } else if (moodScore >= 6) {
    // Moderately positive mood - leafy green plants
    const contentPlants = ['fern', 'basil', 'mint', 'bamboo', 'lily'];
    return contentPlants[Math.floor(Math.random() * contentPlants.length)];
  } else if (moodScore >= 4) {
    // Neutral mood - sturdy plants
    const neutralPlants = ['snake_plant', 'pothos', 'zz_plant', 'prayer_plant', 'monstera'];
    return neutralPlants[Math.floor(Math.random() * neutralPlants.length)];
  } else if (moodScore >= 2) {
    // Low mood - resilient plants
    const lowMoodPlants = ['succulent', 'cactus', 'aloe', 'jade', 'haworthia'];
    return lowMoodPlants[Math.floor(Math.random() * lowMoodPlants.length)];
  } else {
    // Very low mood - unique plants that thrive in harsh conditions
    const veryLowMoodPlants = ['air_plant', 'moss', 'desert_rose', 'lithops', 'stone_crop'];
    return veryLowMoodPlants[Math.floor(Math.random() * veryLowMoodPlants.length)];
  }
}

// Function to get mood garden summary
exports.getMoodGarden = functions.https.onCall(async (data, context) => {
  const userId = authenticateUser(context);
  
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    
    const userData = userDoc.data();
    const moodGarden = userData.moodGarden || { totalPlants: 0, plants: [] };
    
    // Format plant timestamps for client
    const formattedPlants = moodGarden.plants.map(plant => ({
      plantType: plant.plantType,
      plantedAt: plant.plantedAt.toDate().toISOString(),
      moodScore: plant.moodScore
    }));
    
    // Calculate mood trends
    const moodTrends = calculateMoodTrends(moodGarden.plants);
    
    return {
      success: true,
      garden: {
        totalPlants: moodGarden.totalPlants,
        plants: formattedPlants
      },
      moodTrends: moodTrends
    };
  } catch (error) {
    console.error('Error getting mood garden:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Helper function to calculate mood trends
function calculateMoodTrends(plants) {
  if (!plants || plants.length === 0) {
    return {
      averageMood: 0,
      moodDistribution: {
        high: 0,
        medium: 0,
        low: 0
      }
    };
  }
  
  // Sort plants by planting date
  const sortedPlants = [...plants].sort((a, b) => a.plantedAt.toDate() - b.plantedAt.toDate());
  
  // Calculate average mood
  const totalMood = sortedPlants.reduce((sum, plant) => sum + plant.moodScore, 0);
  const averageMood = totalMood / sortedPlants.length;
  
  // Calculate mood distribution
  const moodDistribution = {
    high: 0,  // 7-10
    medium: 0, // 4-6
    low: 0    // 1-3
  };
  
  sortedPlants.forEach(plant => {
    if (plant.moodScore >= 7) {
      moodDistribution.high += 1;
    } else if (plant.moodScore >= 4) {
      moodDistribution.medium += 1;
    } else {
      moodDistribution.low += 1;
    }
  });
  
  return {
    averageMood: Math.round(averageMood * 10) / 10, // Round to 1 decimal place
    moodDistribution: moodDistribution
  };
}

module.exports = {
  logMoodEntry,
  getMoodGarden
};