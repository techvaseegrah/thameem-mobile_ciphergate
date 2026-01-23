import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

// Import EmployeeSidebar
import EmployeeSidebar from '../components/EmployeeSidebar';

// Import face-api.js
import * as faceapi from 'face-api.js';

const WorkerAttendance = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [worker, setWorker] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Location validation states
  const [locationValid, setLocationValid] = useState(false);
  const [locationChecked, setLocationChecked] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [distanceFromSite, setDistanceFromSite] = useState(0); // New state for distance
  
  // Modal states
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [showRFIDModal, setShowRFIDModal] = useState(false);
  
  // Face recognition states
  const [faceDetectionStatus, setFaceDetectionStatus] = useState('idle');
  const [faceError, setFaceError] = useState('');
  const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);
  const [isGlobalCooldownActive, setIsGlobalCooldownActive] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(null);
  const [workersOnCooldown, setWorkersOnCooldown] = useState(new Set());
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const workerDescriptorsRef = useRef([]);
  const cooldownIntervalRef = useRef(null);
  
  // RFID states
  const [rfidInput, setRfidInput] = useState('');
  const [scanningRFID, setScanningRFID] = useState(false);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('employee');
    // Close sidebar on mobile when logging out
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    navigate('/employee/login');
  };
  
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };
  
  // Cleanup function to clear intervals
  useEffect(() => {
    return () => {
      // Clear any active cooldown timers
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
  }, []);

  // Haversine formula to calculate distance between two points
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format time for display
  const formatTime = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Function to group attendance records by date and maintain proper in/out pairs
  const groupAttendanceByDate = (records) => {
    if (!records || !Array.isArray(records)) return {};
    
    const grouped = {};
    records.forEach(record => {
      const dateKey = new Date(record.date).toDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      
      // Add the complete record as a pair (or partial pair)
      grouped[dateKey].push(record);
    });
    
    // Sort each day's records by date/time
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => {
        const timeA = new Date(a.checkIn || a.checkOut || a.date);
        const timeB = new Date(b.checkIn || b.checkOut || b.date);
        return timeA - timeB; // Sort by time ascending
      });
    });
    
    return grouped;
  };
  


  // Calculate duration between check-in and check-out
  const calculateDuration = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return '-';
    
    const inTime = new Date(checkIn);
    const outTime = new Date(checkOut);
    const diffMs = outTime - inTime;
    
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  // Close Face Modal
  const closeFaceModal = useCallback(() => {
    setShowFaceModal(false);
    setFaceDetectionStatus('idle');
    setFaceError('');
    workerDescriptorsRef.current = [];
    
    // Clean up video stream
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear detection interval
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // Close RFID Modal
  const closeRFIDModal = useCallback(() => {
    setShowRFIDModal(false);
    setScanningRFID(false);
    setRfidInput('');
  }, []);

  // Fetch attendance records for the worker
  const fetchAttendanceRecords = useCallback(async (workerId) => {
    try {
      const res = await api.get(`/workers/${workerId}`);
      const workerData = res.data;
      
      // Process attendance records
      if (workerData.attendanceRecords && Array.isArray(workerData.attendanceRecords)) {
        // Sort by date and time descending (latest first)
        const sortedRecords = [...workerData.attendanceRecords].sort((a, b) => {
          // Sort primarily by date
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          if (dateA.getTime() !== dateB.getTime()) {
            return dateB - dateA; // Sort by date descending
          }
          // If same date, sort by checkIn time first, then checkOut time
          const timeA = new Date(a.checkIn || a.checkOut || a.date);
          const timeB = new Date(b.checkIn || b.checkOut || b.date);
          return timeB - timeA; // Sort by time descending
        });
        setAttendanceRecords(sortedRecords);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch attendance records');
    }
  }, []);

  // Validate worker location against admin settings
  const validateLocation = useCallback(async () => {
    try {
      // Get admin location settings
      const settingsRes = await api.get('/admin/public-location-settings');
      const { enabled, latitude, longitude, radius } = settingsRes.data;
      
      // Check if location settings are enabled and configured
      if (!enabled || !latitude || !longitude || !radius) {
        setLocationValid(false);
        setLocationChecked(true);
        setLocationError('Location settings not configured by admin');
        return;
      }
      
      // Get worker's current location
      if (!navigator.geolocation) {
        setLocationValid(false);
        setLocationChecked(true);
        setLocationError('Geolocation is not supported by your browser');
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const workerLat = position.coords.latitude;
          const workerLng = position.coords.longitude;
          
          // Calculate distance using Haversine formula
          const distance = calculateDistance(latitude, longitude, workerLat, workerLng);
          setDistanceFromSite(distance/1000); // Store distance in km
          
          // Check if within allowed radius
          if (distance <= radius) {
            setLocationValid(true);
            setLocationError('');
          } else {
            setLocationValid(false);
            setLocationError(`You are outside the allowed attendance location. Distance: ${(distance/1000).toFixed(2)} km from site.`);
          }
          setLocationChecked(true);
        },
        (err) => {
          setLocationValid(false);
          setLocationChecked(true);
          // Handle different types of geolocation errors
          switch(err.code) {
            case err.PERMISSION_DENIED:
              setLocationError('Location permission denied. Please enable location access to use attendance features.');
              break;
            case err.POSITION_UNAVAILABLE:
              setLocationError('Location information is unavailable. Please check your device location settings and try again.');
              break;
            case err.TIMEOUT:
              setLocationError('Location request timed out. Please try again.');
              break;
            default:
              setLocationError('Unable to retrieve your location. Please check your device location settings and try again.');
              break;
          }
          console.error('Geolocation error:', err);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000
        }
      );
    } catch (err) {
      console.error('Location validation error:', err);
      setLocationValid(false);
      setLocationChecked(true);
      setLocationError('Unable to validate location. Please try again.');
    }
  }, []);

  // State for cooldown timer
  const [cooldownRemainingTime, setCooldownRemainingTime] = useState(0);
  const [isWorkerOnCooldownState, setIsWorkerOnCooldownState] = useState(false);
  
  // Record face attendance
  const recordFaceAttendance = useCallback(async () => {
    try {
      await api.post('/workers/attendance', {
        workerId: worker._id,
        method: 'face'
      });
      setSuccess('Attendance recorded successfully!');
    } catch (err) {
      console.error('Error recording attendance:', err);
      if (err.response?.data?.reason === 'COOLDOWN_ACTIVE') {
        const remainingTime = err.response.data.remainingTime;
        setCooldownRemainingTime(remainingTime);
        setIsGlobalCooldownActive(true);
        
        // Update UI to reflect cooldown state
        setFaceError(`Please wait ${remainingTime} seconds before next punch`);
        setFaceDetectionStatus('cooldown');
        
        // Clear the face detection interval to stop face recognition during cooldown
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
          detectionIntervalRef.current = null;
        }
        
        // Start countdown timer
        if (cooldownIntervalRef.current) {
          clearInterval(cooldownIntervalRef.current);
        }
        cooldownIntervalRef.current = setInterval(() => {
          setCooldownRemainingTime(prevTime => {
            const newTime = prevTime - 1;
            if (newTime <= 0) {
              if (cooldownIntervalRef.current) {
                clearInterval(cooldownIntervalRef.current);
                cooldownIntervalRef.current = null;
              }
              setIsGlobalCooldownActive(false);
              setFaceDetectionStatus('camera_ready');
              setFaceError('');
              
              // Restart face detection after cooldown ends
              setTimeout(() => {
                if (faceModelsLoaded && worker && !isGlobalCooldownActive) {
                  // Restart face detection if still in the right state
                  if (faceDetectionStatus === 'camera_ready' || faceDetectionStatus === 'detecting') {
                    if (detectionIntervalRef.current) {
                      clearInterval(detectionIntervalRef.current);
                    }
                    detectionIntervalRef.current = setInterval(detectFace, 100);
                    setFaceDetectionStatus('detecting');
                  }
                }
              }, 100); // Small delay to ensure state is settled
              
              return 0;
            }
            // Update error message with new remaining time
            setFaceError(`Please wait ${newTime} seconds before next punch`);
            return newTime;
          });
        }, 1000);
      } else {
        setError('Failed to record attendance');
        setFaceError('Failed to record attendance');
      }
    }
  }, [worker, detectFace, faceDetectionStatus, faceModelsLoaded, isGlobalCooldownActive]);

  // Record RFID attendance
  const recordRFIDAttendance = useCallback(async (rfid) => {
    try {
      const response = await api.post('/workers/attendance', {
        rfid,
        method: 'rfid'
      });
      
      setSuccess(`Attendance recorded for ${response.data.attendanceRecord.workerName || 'worker'}`);
      closeRFIDModal();
      // Refresh attendance records
      fetchAttendanceRecords(worker._id);
    } catch (err) {
      console.error('Error recording RFID attendance:', err);
      if (err.response?.data?.reason === 'COOLDOWN_ACTIVE') {
        const remainingTime = err.response.data.remainingTime;
        setCooldownRemainingTime(remainingTime);
        setError(`Please wait ${remainingTime} seconds before next punch`);
        setIsGlobalCooldownActive(true);
        
        // Start countdown timer
        if (cooldownIntervalRef.current) {
          clearInterval(cooldownIntervalRef.current);
        }
        cooldownIntervalRef.current = setInterval(() => {
          setCooldownRemainingTime(prevTime => {
            const newTime = prevTime - 1;
            if (newTime <= 0) {
              if (cooldownIntervalRef.current) {
                clearInterval(cooldownIntervalRef.current);
                cooldownIntervalRef.current = null;
              }
              setIsGlobalCooldownActive(false);
              setError('');
              return 0;
            }
            setError(`Please wait ${newTime} seconds before next punch`);
            return newTime;
          });
        }, 1000);
      } else {
        setError('Failed to record attendance');
      }
    }
  }, [worker, fetchAttendanceRecords, closeRFIDModal]);

  // Handle RFID input
  const handleRFIDInput = useCallback((e) => {
    setRfidInput(e.target.value);
    
    // Auto-submit when RFID is scanned (assuming RFID scanners append Enter key)
    if (e.key === 'Enter' && e.target.value) {
      recordRFIDAttendance(e.target.value);
    }
  }, [recordRFIDAttendance]);

  // Handle manual RFID submission
  const handleManualRFIDSubmit = useCallback(() => {
    if (rfidInput) {
      recordRFIDAttendance(rfidInput);
    }
  }, [rfidInput, recordRFIDAttendance]);

  // Store the last detected face to check for stability
  const lastDetectedFaceRef = useRef({
    workerId: null,
    timestamp: 0,
    count: 0
  });
  
  // Enhanced function to check if a worker is on cooldown with timestamp backup
  const isWorkerOnCooldown = (workerId) => {
    // First check using the primary method
    const primaryCheck = isCooldownActive(workerId);
    if (primaryCheck.active) {
      return primaryCheck;
    }
    
    // If primary check says not active, double-check using timestamp-based approach
    // This helps in cases where state might not have updated yet
    const lastPunchTime = localStorage.getItem(`lastPunchTime_${workerId}`);
    if (lastPunchTime) {
      const timeDiff = Date.now() - parseInt(lastPunchTime);
      if (timeDiff < 60000) { // Less than 1 minute
        const remainingTime = 60000 - timeDiff;
        return { active: true, remainingTime };
      } else {
        // Cooldown expired, remove from localStorage
        localStorage.removeItem(`lastPunchTime_${workerId}`);
      }
    }
    
    return { active: false, remainingTime: 0 };
  };
  
  // Check if enough time has passed since last punch (1 minute cooldown)
  // Returns object with cooldown status and remaining time
  const isCooldownActive = (workerId) => {
    // First, check if worker is in the cooldown set
    if (!workersOnCooldown.has(workerId)) {
      console.log(`Worker ${workerId} is not in cooldown set`);
      return { active: false, remainingTime: 0 };
    }
    
    console.log(`Worker ${workerId} is in cooldown set`);
    
    // If worker is in cooldown set, check the timer
    if (cooldownTimer && cooldownTimer.workerId === workerId) {
      const remainingTime = cooldownTimer.endTime - Date.now();
      console.log(`Cooldown timer for worker ${workerId}: ${remainingTime}ms remaining`);
      
      // Only return active if remaining time is positive
      if (remainingTime > 0) {
        return { 
          active: true,
          remainingTime: remainingTime
        };
      } else {
        // Timer has expired, remove worker from cooldown set
        console.log(`Cooldown expired for worker ${workerId}, removing from cooldown set`);
        setWorkersOnCooldown(prev => {
          const newSet = new Set(prev);
          newSet.delete(workerId);
          return newSet;
        });
        // Clear the cooldown timer
        setCooldownTimer(null);
        return { active: false, remainingTime: 0 };
      }
    }
    
    // If worker is in cooldown set but no timer, assume cooldown is active
    // This handles cases where the component re-renders but the timer state is lost
    console.log(`Worker ${workerId} in cooldown set but no timer, assuming active`);
    return { active: true, remainingTime: 60000 }; // Default to 1 minute
  };
  
  // Match face descriptor with known workers
  const matchFaceWithWorker = async (descriptor) => {
    console.log('Matching face with workers...');
    try {
      if (!workerDescriptorsRef.current || workerDescriptorsRef.current.length === 0) {
        console.log('No worker face data available for matching');
        return null;
      }
      
      // Compare with each worker's face descriptors
      for (const workerData of workerDescriptorsRef.current) {
        for (const storedDescriptor of workerData.descriptors) {
          // Calculate Euclidean distance between descriptors
          const distance = faceapi.euclideanDistance(descriptor, storedDescriptor);
          
          // If distance is below threshold, we have a match
          if (distance < 0.4) { // Increased accuracy threshold for face matching
            console.log(`Face matched with worker: ${workerData.workerName} (distance: ${distance})`);
            return {
              _id: workerData.workerId,
              name: workerData.workerName
            };
          }
        }
      }
      
      console.log('No matching worker found');
      return null;
    } catch (error) {
      console.error('Error matching face with workers:', error);
      return null;
    }
  };

  // Function to record a worker's punch time
  const recordWorkerPunchTime = (workerId) => {
    localStorage.setItem(`lastPunchTime_${workerId}`, Date.now().toString());
  };
    
  // Create a ref to hold the detectFace function
  const detectFaceRef = useRef(null);
    
  // Define detectFace as a traditional function (not useCallback)
  async function detectFace() {
    // Check if we're currently in cooldown
    if (isWorkerOnCooldownState) {
      return; // Don't attempt to detect face during cooldown
    }
        
    if (!videoRef.current || workerDescriptorsRef.current.length === 0) {
      return;
    }
        
    const video = videoRef.current;
        
    try {
      // Detect faces using face-api.js
      const detections = await faceapi.detectAllFaces(video)
        .withFaceLandmarks()
        .withFaceDescriptors();
        
      // Validate detections result
      if (!detections || !Array.isArray(detections)) {
        console.log('No faces detected or invalid detection result');
        return;
      }
        
      console.log(`Found ${detections.length} faces`);
        
      // Draw detections on canvas
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const displaySize = { 
          width: video.videoWidth || video.width || 640, 
          height: video.videoHeight || video.height || 480 
        };
          
        // Set canvas dimensions to match video
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
          
        // Clear canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
          
        // Draw face detection results
        if (detections && Array.isArray(detections) && detections.length > 0) {
          faceapi.draw.drawDetections(canvas, detections.map(d => d.detection));
          faceapi.draw.drawFaceLandmarks(canvas, detections);
        }
      }
        
      if (detections && Array.isArray(detections) && detections.length > 0) {
        // Match face with known workers
        const matchedWorker = await matchFaceWithWorker(detections[0].descriptor);
          
        // ENHANCED COOLDOWN CHECK using multiple methods
        if (matchedWorker) {
          // Use the enhanced cooldown check that combines multiple approaches
          const cooldownInfo = isWorkerOnCooldown(matchedWorker._id);
            
          if (cooldownInfo.active) {
            console.log('Worker on cooldown (enhanced check), skipping all processing');
            setFaceDetectionStatus('cooldown');
              
            // Update the cooldown timer display
            setCooldownTimer({
              workerId: matchedWorker._id,
              endTime: Date.now() + cooldownInfo.remainingTime,
              remainingTime: cooldownInfo.remainingTime
            });
              
            // Show cooldown message
            const remainingSeconds = Math.ceil(cooldownInfo.remainingTime / 1000);
            setFaceError(`Please wait ${remainingSeconds} seconds before next punch`);
              
            // Clear error message after 3 seconds
            setTimeout(() => {
              setFaceError('');
            }, 3000);
              
            return;
          }
        }
          
        // Skip if worker is on cooldown (double-check using the Set)
        if (matchedWorker && workersOnCooldown.has(matchedWorker._id)) {
          console.log('Worker is on cooldown (Set check), skipping detection');
          setFaceDetectionStatus('cooldown');
            
          // Update the cooldown timer display
          const cooldownInfo = isCooldownActive(matchedWorker._id);
          if (cooldownInfo.active) {
            setCooldownTimer({
              workerId: matchedWorker._id,
              endTime: Date.now() + cooldownInfo.remainingTime,
              remainingTime: cooldownInfo.remainingTime
            });
              
            // Show cooldown message
            const remainingSeconds = Math.ceil(cooldownInfo.remainingTime / 1000);
            setFaceError(`Please wait ${remainingSeconds} seconds before next punch`);
          } else {
            // If cooldown has expired, remove worker from cooldown set
            setWorkersOnCooldown(prev => {
              const newSet = new Set(prev);
              newSet.delete(matchedWorker._id);
              return newSet;
            });
          }
            
          return;
        }
                            
        if (matchedWorker) {
          console.log('Face matched with worker:', matchedWorker.name);
  
          // CHECK COOLDOWN IMMEDIATELY when worker is detected, BEFORE stability check
          const cooldownInfo = isCooldownActive(matchedWorker._id);
          if (cooldownInfo.active) {
            console.log('Worker on cooldown, skipping stability check');
            setFaceDetectionStatus('cooldown');
              
            // Update the cooldown timer display
            setCooldownTimer({
              workerId: matchedWorker._id,
              endTime: Date.now() + cooldownInfo.remainingTime,
              remainingTime: cooldownInfo.remainingTime
            });
              
            // Show error message
            const remainingSeconds = Math.ceil(cooldownInfo.remainingTime / 1000);
            setFaceError(`Please wait ${remainingSeconds} seconds before next punch`);
              
            // Clear error message after 3 seconds
            setTimeout(() => {
              setFaceError('');
            }, 3000);
              
            return;
          }
            
          // Only proceed with stability check if worker is NOT on cooldown
          // Check for face stability - require the same face to be detected multiple times
          const now = Date.now();
          const STABILITY_THRESHOLD = 3; // Require 3 consecutive detections
          const TIME_WINDOW = 2000; // Within 2 seconds
            
          if (lastDetectedFaceRef.current.workerId === matchedWorker._id && 
              (now - lastDetectedFaceRef.current.timestamp) < TIME_WINDOW) {
            // Same worker detected recently, increment count
            lastDetectedFaceRef.current.count++;
            lastDetectedFaceRef.current.timestamp = now;
          } else {
            // Different worker or too much time passed, reset counter
            lastDetectedFaceRef.current.workerId = matchedWorker._id;
            lastDetectedFaceRef.current.timestamp = now;
            lastDetectedFaceRef.current.count = 1;
          }
            
          // Only proceed if face is stable (detected enough times)
          if (lastDetectedFaceRef.current.count >= STABILITY_THRESHOLD) {
            console.log('Face is stable, proceeding with attendance check');
              
            // Reset the stability counter
            lastDetectedFaceRef.current.count = 0;
              
            // Add a small delay to prevent rapid consecutive detections
            await new Promise(resolve => setTimeout(resolve, 500));
              
            // Check if cooldown is active for this worker AGAIN (in case it changed during the delay)
            const cooldownInfo = isCooldownActive(matchedWorker._id);
            if (!cooldownInfo.active) {
              // Automatically record attendance for the detected worker
              try {
                // Record attendance automatically
                // For face recognition, we need to identify the worker first
                // Then send the workerId to the existing attendance endpoint
                  
                // In a real implementation, you would perform face recognition here
                // to match the detected face with stored worker face data
                  
                // For demonstration, we'll assume the worker is identified
                // You would replace this with actual face recognition logic
                const identifiedWorkerId = matchedWorker._id;
                  
                // Send attendance record request with workerId
                const attendanceData = {
                  workerId: identifiedWorkerId,
                  method: 'face' // Face method for admin attendance - will skip location validation
                };
  
                // Location is not required for face attendance from admin page
  
                console.log('Recording attendance for worker:', identifiedWorkerId);
                const response = await api.post('/workers/attendance', attendanceData);
                  
                if (response.status === 200 || response.status === 201) {
                  const responseData = response.data;
                    
                  // Check if attendance was successfully recorded or if it was rejected due to location or cooldown
                  if (responseData.success === false) {
                    if (responseData.reason === "COOLDOWN_ACTIVE") {
                      // Attendance was rejected due to cooldown
                      console.log('Attendance rejected due to cooldown for', matchedWorker.name);
                      setFaceError(responseData.message);
                        
                      // Add worker to cooldown set to prevent continuous detection
                      setWorkersOnCooldown(prev => {
                        const newSet = new Set(prev);
                        newSet.add(matchedWorker._id);
                        return newSet;
                      });
                        
                      // Set cooldown timer state for UI updates
                      const remainingTime = responseData.remainingTime * 1000; // Convert seconds to milliseconds
                      const cooldownEndTime = Date.now() + remainingTime;
                      setCooldownTimer({
                        workerId: matchedWorker._id,
                        endTime: cooldownEndTime,
                        remainingTime: remainingTime
                      });
                        
                      // Clear error message after 3 seconds
                      setTimeout(() => {
                        setFaceError('');
                      }, 3000);
                    } else if (responseData.message && responseData.message.includes('outside the allowed attendance location')) {
                      // Attendance was rejected due to location
                      console.log('Attendance rejected due to location for', matchedWorker.name);
                      setFaceError('You are outside the allowed attendance location');
                        
                      // Clear error message after 3 seconds
                      setTimeout(() => {
                        setFaceError('');
                      }, 3000);
                    } else if (responseData.message && responseData.message.includes('Location permission is required')) {
                      // Attendance was rejected due to missing location permission
                      console.log('Attendance rejected due to missing location permission for', matchedWorker.name);
                      setFaceError('Location permission is required to mark attendance');
                        
                      // Clear error message after 3 seconds
                      setTimeout(() => {
                        setFaceError('');
                      }, 3000);
                    } else {
                      // Other error
                      setFaceError(responseData.message || 'Failed to record attendance');
                        
                      // Clear error message after 3 seconds
                      setTimeout(() => {
                        setFaceError('');
                      }, 3000);
                    }
                  } else if (responseData.success === true) {
                    // Attendance was successfully recorded
                    console.log('Attendance recorded successfully for', matchedWorker.name);
                      
                    // Record the punch time for additional reliability
                    recordWorkerPunchTime(matchedWorker._id);
                      
                    // Add worker to cooldown set to prevent continuous detection
                    setWorkersOnCooldown(prev => {
                      const newSet = new Set(prev);
                      newSet.add(matchedWorker._id);
                      return newSet;
                    });
                      
                    // Set cooldown timer state for UI updates
                    const cooldownEndTime = Date.now() + 60000; // 1 minute from now
                    setCooldownTimer({
                      workerId: matchedWorker._id,
                      endTime: cooldownEndTime,
                      remainingTime: 60000
                    });
                      
                    // Clear success message after 3 seconds
                    setTimeout(() => {
                      setFaceError('Face recognized and attendance recorded!');
                    }, 3000);
                      
                    // Refresh workers data to update attendance records
                    await fetchAttendanceRecords(worker._id);
                  } else {
                    // Handle case where response doesn't match expected format
                    console.log('Unexpected response format from server:', responseData);
                    setFaceError('Attendance recorded successfully');
                      
                    // Record the punch time for additional reliability
                    recordWorkerPunchTime(matchedWorker._id);
                      
                    // Add worker to cooldown set to prevent continuous detection
                    setWorkersOnCooldown(prev => {
                      const newSet = new Set(prev);
                      newSet.add(matchedWorker._id);
                      return newSet;
                    });
                      
                    // Set cooldown timer state for UI updates
                    const cooldownEndTime = Date.now() + 60000; // 1 minute from now
                    setCooldownTimer({
                      workerId: matchedWorker._id,
                      endTime: cooldownEndTime,
                      remainingTime: 60000
                    });
                      
                    // Clear success message after 3 seconds
                    setTimeout(() => {
                      setFaceError('');
                    }, 3000);
                      
                    // Refresh workers data to update attendance records
                    await fetchAttendanceRecords(worker._id);
                  }
                } else {
                  throw new Error('Failed to record attendance');
                }
              } catch (attendanceError) {
                console.error('Error recording attendance:', attendanceError);
                if (attendanceError.response && attendanceError.response.data && attendanceError.response.data.message) {
                  setFaceError(attendanceError.response.data.message);
                } else {
                  setFaceError('Failed to record attendance. Please try again.');
                }
              }
            } else {
              console.log('Worker on cooldown, skipping attendance recording');
              const remainingSeconds = Math.ceil(cooldownInfo.remainingTime / 1000);
              setFaceError(`Please wait ${remainingSeconds} seconds before next punch`);
                
              // Clear error message after 3 seconds
              setTimeout(() => {
                setFaceError('');
              }, 3000);
            }
              
            // Only set recognized status if attendance was actually recorded
            if (!cooldownInfo.active) {
              setFaceDetectionStatus('recognized');
              // Reset to detecting after a short delay to show the success message
              setTimeout(() => {
                setFaceDetectionStatus('detecting');
              }, 2000);
            } else {
              setFaceDetectionStatus('cooldown');
              // Reset to detecting after a short delay to show the cooldown message
              setTimeout(() => {
                setFaceDetectionStatus('detecting');
              }, 2000);
            }
          } else {
            console.log(`Face detected but not stable yet (${lastDetectedFaceRef.current.count}/${STABILITY_THRESHOLD})`);
            setFaceDetectionStatus('detecting');
          }
        } else {
          console.log('Face detected but not recognized');
          setFaceDetectionStatus('detecting');
            
          // Reset stability counter when face is not recognized
          lastDetectedFaceRef.current.count = 0;
        }
      } else {
        console.log('No faces detected');
        setFaceDetectionStatus('detecting');
          
        // Reset stability counter when no face is detected
        // This prevents false positives when someone moves away and then back
        if (lastDetectedFaceRef.current.count > 0) {
          lastDetectedFaceRef.current.count = 0;
          console.log('Resetting face stability counter due to no face detection');
        }
      }
    } catch (err) {
      console.error('Error during face detection:', err);
      console.error('Error details:', {
        name: err.name,
        message: err.message,
        stack: err.stack
      });
      setFaceDetectionStatus('error');
      setFaceError('Face detection error. Please try again.');
    }
  }
    
  // Assign the function to the ref so it can be accessed by other functions
  useEffect(() => {
    detectFaceRef.current = detectFace;
  });

  // Load worker face data for recognition
  const loadWorkerFaceData = useCallback(async () => {
    console.log('Loading worker face data for recognition...');
    try {
      // Reset worker descriptors
      workerDescriptorsRef.current = [];
      
      // Process worker who has face data
      if (worker && worker.faceData && worker.faceData.length > 0) {
        console.log(`Processing face data for worker: ${worker.name}`);
        
        try {
          // Convert base64 face data to descriptors
          const faceDescriptors = [];
          
          for (const faceImageBase64 of worker.faceData) {
            try {
              // Create image element from base64
              const img = new Image();
              
              // If the base64 string doesn't have a data URL prefix, add it
              let dataUrl = faceImageBase64;
              if (!dataUrl.startsWith('data:image')) {
                dataUrl = `data:image/jpeg;base64,${faceImageBase64}`;
              }
              
              img.src = dataUrl;
              
              // Wait for image to load with a timeout
              await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error('Image loading timeout'));
                }, 5000); // 5 second timeout
                
                img.onload = () => {
                  clearTimeout(timeout);
                  resolve();
                };
                
                img.onerror = () => {
                  clearTimeout(timeout);
                  reject(new Error('Image loading error'));
                };
              });
              
              // Detect face and get descriptor
              const detection = await faceapi.detectSingleFace(img)
                .withFaceLandmarks()
                .withFaceDescriptor();
              
              if (detection) {
                faceDescriptors.push(detection.descriptor);
                console.log(`Generated descriptor for face image of ${worker.name}`);
              } else {
                console.log(`No face detected in image for ${worker.name}`);
              }
            } catch (imgErr) {
              console.error(`Error processing face image for ${worker.name}:`, imgErr);
            }
          }
          
          if (faceDescriptors.length > 0) {
            workerDescriptorsRef.current.push({
              workerId: worker._id,
              workerName: worker.name,
              descriptors: faceDescriptors
            });
            console.log(`Loaded ${faceDescriptors.length} face descriptors for ${worker.name}`);
          }
        } catch (err) {
          console.error(`Error processing face data for worker ${worker.name}:`, err);
        }
      }
      
      console.log(`Loaded face data for worker`);
    } catch (error) {
      console.error('Error loading worker face data:', error);
    }
  }, [worker]);

  // Start face recognition
  const startFaceRecognition = useCallback(async () => {
    if (!faceModelsLoaded || !worker) return;
      
    try {
      setFaceDetectionStatus('camera_ready');
      setFaceError(''); // Clear any previous errors
        
      // Load worker's face data
      await loadWorkerFaceData();
      
      // Access camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
        
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setFaceDetectionStatus('detecting');
          
        // Start detection interval using the ref to avoid dependency issues
        detectionIntervalRef.current = setInterval(() => {
          if (detectFaceRef.current) {
            detectFaceRef.current();
          }
        }, 1000); // Changed to 1000ms to match admin
      }
    } catch (err) {
      console.error('Error starting face recognition:', err);
      setFaceDetectionStatus('error');
    }
  }, [faceModelsLoaded, worker, loadWorkerFaceData]);

  // Fetch worker data
  useEffect(() => {
    const fetchWorkerData = async () => {
      try {
        const res = await api.get(`/workers/${id}`);
        setWorker(res.data);
        await fetchAttendanceRecords(res.data._id);
        await validateLocation();
      } catch (err) {
        console.error(err);
        setError('Failed to fetch worker data');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkerData();
  }, [id, fetchAttendanceRecords, validateLocation]);

  // Load face recognition models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
        setFaceModelsLoaded(true);
      } catch (err) {
        console.error('Error loading face models:', err);
        setFaceDetectionStatus('error');
      }
    };

    if (showFaceModal) {
      loadModels();
    }
  }, [showFaceModal]);

  // Load worker face data when modal opens and models are loaded
  useEffect(() => {
    const loadWorkerFaceDataWrapper = async () => {
      if (showFaceModal && faceModelsLoaded && worker) {
        await loadWorkerFaceData();
      }
    };
    loadWorkerFaceDataWrapper();
  }, [showFaceModal, faceModelsLoaded, worker, loadWorkerFaceData]);

  // Effect to start face recognition when modal opens and models are loaded
  useEffect(() => {
    if (showFaceModal && faceModelsLoaded && (faceDetectionStatus === 'loading' || faceDetectionStatus === 'camera_ready')) {
      startFaceRecognition();
    }
  }, [showFaceModal, faceModelsLoaded, faceDetectionStatus, startFaceRecognition]);

  // Handle Face Attendance button click
  const handleFaceAttendance = () => {
    if (!locationValid) return;
    setShowFaceModal(true);
    setFaceDetectionStatus('loading');
    
    // If models aren't loaded yet, trigger loading
    if (!faceModelsLoaded) {
      const loadModels = async () => {
        try {
          await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
          await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
          await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
          setFaceModelsLoaded(true);
        } catch (err) {
          console.error('Error loading face models:', err);
          setFaceDetectionStatus('error');
        }
      };
      loadModels();
    }
  };

  // Handle RFID Attendance button click
  const handleRFIDAttendance = () => {
    if (!locationValid) return;
    setShowRFIDModal(true);
    setScanningRFID(true);
    setRfidInput('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-center">
          <div className="text-xl">Loading attendance data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-6xl mx-auto p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">Error</h3>
              <p className="mt-2 text-gray-500">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-full mx-auto p-2 sm:p-4">
        {/* Header */}
        <div className="bg-white shadow">
          <div className="px-2 py-2 sm:px-4 sm:py-4">
            <div className="flex flex-col sm:items-start gap-2 sm:gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Attendance</h1>
                <p className="text-sm sm:text-base text-gray-600">Track your attendance records</p>
              </div>
              <div className="flex flex-col sm:flex-row sm:space-x-2 w-full sm:w-auto">
                <button
                  onClick={handleFaceAttendance}
                  disabled={!locationValid || !locationChecked}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-semibold transition flex items-center mb-2 sm:mb-0 text-sm ${
                    locationValid && locationChecked
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Face Attendance
                </button>
                <button
                  onClick={handleRFIDAttendance}
                  disabled={!locationValid || !locationChecked}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-semibold transition flex items-center text-sm ${
                    locationValid && locationChecked
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  RFID Attendance
                </button>
              </div>
            </div>
            
            {/* Success/Error Messages */}
            {success && (
              <div className="mt-4 p-3 bg-green-100 text-green-800 rounded-lg">
                {success}
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-lg">
                {error}
              </div>
            )}
            
            {/* Location validation message */}
            {!locationChecked ? (
              <div className="mt-2 sm:mt-4 p-2 sm:p-3 bg-yellow-100 text-yellow-800 rounded-lg text-xs sm:text-sm">
                Checking your location...
              </div>
            ) : !locationValid ? (
              <div className="mt-2 sm:mt-4 p-2 sm:p-3 bg-red-100 text-red-800 rounded-lg text-xs sm:text-sm">
                {locationError || 'You are outside the allowed attendance location. Attendance is disabled.'}
              </div>
            ) : (
              <div className="mt-2 sm:mt-4 p-2 sm:p-3 bg-green-100 text-green-800 rounded-lg text-xs sm:text-sm">
                You are within the allowed attendance location. Distance: {distanceFromSite.toFixed(2)} km from site.
              </div>
            )}
          </div>
        </div>

        <div className="max-w-full mx-auto p-2 sm:p-4">
          {/* Attendance Records Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="border-b border-gray-200 px-2 py-1.5 sm:px-3 sm:py-2">
              <h3 className="text-base sm:text-lg font-semibold">Your Attendance Records</h3>
            </div>
            {attendanceRecords.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No attendance records found.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                {/* Group records by date */}
                {(() => {
                  const groupedRecords = groupAttendanceByDate(attendanceRecords);
                  const sortedDates = Object.keys(groupedRecords).sort((a, b) => new Date(b) - new Date(a));
                  
                  return (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-1 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-2 sm:py-2 md:px-3 md:py-3">Date</th>
                          <th scope="col" className="px-1 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-2 sm:py-2 md:px-3 md:py-3">In</th>
                          <th scope="col" className="px-1 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-2 sm:py-2 md:px-3 md:py-3">Out</th>
                          <th scope="col" className="px-1 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-2 sm:py-2 md:px-3 md:py-3">Duration</th>
                          <th scope="col" className="px-1 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-2 sm:py-2 md:px-3 md:py-3">Methods</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedDates.map(dateStr => {
                          const dailyRecords = groupedRecords[dateStr];
                          
                          // Collect all check-in and check-out times for the day
                          const allCheckIns = [];
                          const allCheckOuts = [];
                          const allMethods = new Set();
                          
                          dailyRecords.forEach(record => {
                            if (record.checkIn) {
                              allCheckIns.push({ time: record.checkIn, method: record.method });
                              allMethods.add(record.method);
                            }
                            if (record.checkOut) {
                              allCheckOuts.push({ time: record.checkOut, method: record.method });
                              allMethods.add(record.method);
                            }
                          });
                          
                          // Sort times chronologically
                          allCheckIns.sort((a, b) => new Date(a.time) - new Date(b.time));
                          allCheckOuts.sort((a, b) => new Date(a.time) - new Date(b.time));
                          
                          // Calculate duration based on paired check-ins and check-outs
                          let totalMilliseconds = 0;
                          for (let i = 0; i < Math.min(allCheckIns.length, allCheckOuts.length); i++) {
                            const inTime = new Date(allCheckIns[i].time);
                            const outTime = new Date(allCheckOuts[i].time);
                            if (outTime > inTime) {
                              totalMilliseconds += outTime - inTime;
                            }
                          }
                          
                          const totalSeconds = Math.floor(totalMilliseconds / 1000);
                          const hours = Math.floor(totalSeconds / 3600);
                          const minutes = Math.floor((totalSeconds % 3600) / 60);
                          const seconds = totalSeconds % 60;
                          const dailyDuration = `${hours}h ${minutes}m ${seconds}s`;
                          
                          return (
                            <tr key={dateStr}>
                              <td className="px-1 py-1 whitespace-nowrap text-xs text-gray-900 sm:px-2 sm:py-2 md:px-3 md:py-4">
                                {formatDate(new Date(dateStr))}
                              </td>
                              <td className="px-1 py-1 whitespace-nowrap text-xs sm:px-2 sm:py-2 md:px-3 md:py-4">
                                {allCheckIns.length > 0 ? (
                                  <div className="flex flex-col space-y-1">
                                    {allCheckIns.map((entry, idx) => (
                                      <span key={idx} className="text-green-600 font-medium text-xs">
                                        {formatTime(entry.time)}
                                        
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">--:-- --</span>
                                )}
                              </td>
                              <td className="px-1 py-1 whitespace-nowrap text-xs sm:px-2 sm:py-2 md:px-3 md:py-4">
                                {allCheckOuts.length > 0 ? (
                                  <div className="flex flex-col space-y-1">
                                    {allCheckOuts.map((entry, idx) => (
                                      <span key={idx} className="text-red-600 font-medium text-xs">
                                        {formatTime(entry.time)}
                                        
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">--:-- --</span>
                                )}
                              </td>
                              <td className="px-1 py-1 whitespace-nowrap text-xs text-gray-600 sm:px-2 sm:py-2 md:px-3 md:py-4">
                                {dailyDuration}
                              </td>
                              <td className="px-1 py-1 whitespace-nowrap sm:px-2 sm:py-2 md:px-3 md:py-4">
                                <div className="flex flex-wrap gap-1">
                                  {Array.from(allMethods).map(method => (
                                    <span key={method} className={`px-1 py-0.5 inline-flex text-[10px] leading-4 font-semibold rounded-full ${
                                      method === 'face' 
                                        ? 'bg-green-100 text-green-800' 
                                        : method === 'rfid' 
                                          ? 'bg-blue-100 text-blue-800' 
                                          : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {method === 'face' ? 'F' : method === 'rfid' ? 'R' : method.charAt(0).toUpperCase()}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Face Attendance Modal */}
      {showFaceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                Face Attendance
              </h3>
              <button
                onClick={closeFaceModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <div className="mb-4 sm:mb-6">
                <div className="relative w-full h-48 sm:h-64 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                  {(faceDetectionStatus === 'loading' || faceDetectionStatus === 'camera_ready' || faceDetectionStatus === 'detecting' || faceDetectionStatus === 'recognized' || faceDetectionStatus === 'cooldown') && (
                    <>
                      <video 
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <canvas 
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full"
                      />
                      
                      {/* Cooldown Timer Display */}
                      {cooldownTimer && (
                        <div className="absolute top-2 sm:top-4 left-0 right-0 flex justify-center">
                          <div className="bg-yellow-500 bg-opacity-90 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm">
                            Cooldown: {Math.ceil(cooldownTimer.remainingTime / 1000)} seconds remaining
                          </div>
                        </div>
                      )}
                      
                      {faceDetectionStatus === 'detecting' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-blue-500 bg-opacity-75 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm">
                            Detecting face...
                          </div>
                        </div>
                      )}
                      
                      {faceDetectionStatus === 'cooldown' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-yellow-500 bg-opacity-75 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm">
                            On cooldown, please wait...
                          </div>
                        </div>
                      )}
                      
                      {faceDetectionStatus === 'loading' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-gray-500 bg-opacity-75 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm">
                            Initializing camera...
                          </div>
                        </div>
                      )}
                      
                      {faceDetectionStatus === 'recognized' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-green-500 bg-opacity-75 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm">
                            Face recognized and attendance recorded!
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  
                  {faceDetectionStatus === 'error' && (
                    <div className="text-center">
                      <svg className="w-10 h-10 sm:w-12 sm:h-12 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                      </svg>
                      <p className="text-sm text-gray-600">Error accessing camera</p>
                    </div>
                  )}
                </div>
                
                <div className="mt-2 sm:mt-4 text-center">
                  <p className="text-xs sm:text-sm text-gray-600">
                    {faceDetectionStatus === 'detecting' 
                      ? 'Scanning for faces... Please position your face in the frame' 
                      : faceDetectionStatus === 'recognized' 
                        ? 'Face recognized and attendance recorded!' 
                        : faceDetectionStatus === 'loading'
                          ? 'Initializing camera and face detection models...'
                          : faceDetectionStatus === 'error'
                            ? 'Error with face detection. Please close and reopen the scanner.'
                            : faceDetectionStatus === 'cooldown'
                              ? 'On cooldown, please wait before marking attendance again.'
                              : 'Waiting for camera access...'}
                  </p>
                  {faceDetectionStatus === 'loading' && (
                    <div className="mt-2 sm:mt-4">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-t-2 border-b-2 border-blue-500"></div>
                      <p className="text-xs sm:text-sm text-gray-500 mt-2">Loading face detection models...</p>
                    </div>
                  )}
                  {faceDetectionStatus === 'detecting' && (
                    <div className="mt-2 sm:mt-4">
                      <div className="inline-flex space-x-1">
                        <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mt-2">Searching for faces</p>
                    </div>
                  )}
                  {faceDetectionStatus === 'recognized' && (
                    <div className="mt-2 sm:mt-4">
                      <div className="inline-flex items-center justify-center h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-green-500">
                        <svg className="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mt-2">Attendance recorded successfully</p>
                    </div>
                  )}
                  {faceDetectionStatus === 'error' && (
                    <div className="mt-2 sm:mt-4">
                      <div className="inline-flex items-center justify-center h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-red-500">
                        <svg className="h-4 w-4 sm:h-5 sm:w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mt-2">Please close and reopen the scanner</p>
                      <button
                        onClick={closeFaceModal}
                        className="mt-2 px-2 py-1 sm:px-3 sm:py-1 bg-blue-500 text-white rounded text-xs sm:text-sm hover:bg-blue-600 transition"
                      >
                        Close Scanner
                      </button>
                    </div>
                  )}
                </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* RFID Attendance Modal */}
      {showRFIDModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                RFID Attendance
              </h3>
              <button
                onClick={closeRFIDModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <div className="px-4 py-3 sm:px-6 sm:py-4">
              {scanningRFID ? (
                <div className="text-center">
                  <div className="mx-auto bg-gray-200 rounded-full p-3 sm:p-4 w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center mb-3 sm:mb-4">
                    <svg className="w-8 h-8 sm:w-12 sm:h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"></path>
                    </svg>
                  </div>
                  <p className="text-sm text-gray-600 mb-3 sm:mb-4">Scan your RFID card or enter RFID manually</p>
                  <input
                    type="text"
                    value={rfidInput}
                    onChange={(e) => setRfidInput(e.target.value)}
                    onKeyPress={handleRFIDInput}
                    placeholder="Enter RFID"
                    className="w-full border border-gray-300 p-2 sm:p-3 rounded focus:ring-2 focus:ring-blue-500 outline-none mb-3 sm:mb-4 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleManualRFIDSubmit}
                    disabled={!rfidInput}
                    className="w-full px-3 py-1.5 sm:px-4 sm:py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50 text-sm"
                  >
                    Submit RFID
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 sm:py-8">
                  <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-green-600 mx-auto mb-3 sm:mb-4"></div>
                  <p className="text-sm text-gray-600">Recording attendance...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkerAttendance;