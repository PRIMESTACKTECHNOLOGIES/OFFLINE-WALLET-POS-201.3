// Notification sound utility
export const playNotificationSound = (type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
  try {
    // Create audio context
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContext();
    
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Set frequency based on type
    if (type === 'success') {
      oscillator.frequency.value = 1046.50; // C6
    } else if (type === 'error') {
      oscillator.frequency.value = 200; // Low
    } else if (type === 'warning') {
      oscillator.frequency.value = 523.25; // C5
    } else {
      oscillator.frequency.value = 659.25; // E5
    }
    
    oscillator.type = 'sine';
    
    // Fade in/out
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
    
  } catch (error) {
    console.error('Failed to play notification sound', error);
  }
};
