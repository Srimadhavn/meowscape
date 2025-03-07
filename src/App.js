import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { X, ChevronDown,  Image as ImageIcon, Link, MessageSquare, Send, Sticker, Reply, Play, Pause, Mic, StopCircle } from 'lucide-react';
import './App.css';
import './styles/patterns.css';
import debounce from 'lodash/debounce';
import { useSwipeable } from 'react-swipeable';
import { motion } from 'framer-motion';

// Configure axios defaults
axios.defaults.withCredentials = false;
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.post['Content-Type'] = 'application/json';

const API_URL = process.env.REACT_APP_API_URL.replace(/^\/\//, 'https://') || '';

// First define the AudioPlayer component
const AudioPlayer = React.memo(({ audioUrl }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlers = {
      loadedmetadata: () => audio.duration && !isNaN(audio.duration) && setDuration(audio.duration),
      timeupdate: () => audio.currentTime && !isNaN(audio.currentTime) && setCurrentTime(audio.currentTime),
      ended: () => {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    Object.entries(handlers).forEach(([event, handler]) => audio.addEventListener(event, handler));
    if (audio.readyState >= 2) handlers.loadedmetadata();

    return () => Object.entries(handlers).forEach(([event, handler]) => audio.removeEventListener(event, handler));
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      if (audioRef.current.currentTime === audioRef.current.duration) {
        audioRef.current.currentTime = 0;
      }
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="w-full max-w-[240px]">
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2">
        <button
          onClick={handlePlayPause}
          className={`p-2 rounded-full ${isPlaying ? 'bg-love text-white' : 'bg-white'}`}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        
        <div className="flex-1">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-love h-1.5 rounded-full transition-all duration-100"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          className="hidden"
        />
      </div>
    </div>
  );
});

// Add this at the top level, outside of any component
const IMAGE_CACHE = new Map();

// Add this component at the top level, before App component
const AudioPreviewModal = React.memo(({ audioUrl, onSend, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Send Audio Message</h3>
          <button 
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <AudioPlayer audioUrl={audioUrl} />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSend}
            className="px-4 py-2 bg-love text-white rounded-lg hover:bg-love/90"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
});

function App() {
  const socket = useMemo(() => {
    const socketUrl = process.env.REACT_APP_SOCKET_URL.replace(/^\/\//, 'https://');
    return io(socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      secure: true,
      rejectUnauthorized: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
  }, []);

  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('username'));
  const [customStickers, setCustomStickers] = useState(() => {
    const saved = localStorage.getItem('customStickers');
    return saved ? JSON.parse(saved) : { 'My Stickers': [] };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [selectedStickerPack, setSelectedStickerPack] = useState('Love');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const chatContainerRef = useRef(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const [sidebarContent, setSidebarContent] = useState('media');
  const [mediaItems, setMediaItems] = useState({ images: [], videos: [], links: [] });
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedSticker, setSelectedSticker] = useState(null);
  const [stickerPacks, setStickerPacks] = useState({});
  const inputRef = useRef(null);
  const [recentStickers, setRecentStickers] = useState(() => {
    const saved = localStorage.getItem('recentStickers');
    return saved ? JSON.parse(saved) : [];
  });
  
  const ALLOWED_USERS = {
    'Maddy': 'varsha',
    'Varsha': 'maddy'
  };

  const [playSound] = useState(() => {
    const sendAudio = new Audio('/sounds/send.mp3');
    const receiveAudio = new Audio('/sounds/receive.mp3');
    const deleteAudio = new Audio('/sounds/delete.mp3');
    
    // Adjust volumes
    deleteAudio.volume = 0.2;  // Reduced delete sound
    sendAudio.volume = 0.5;    // Increased send sound
    receiveAudio.volume = 0.5; // Increased receive sound
    
    return {
      send: () => sendAudio.play().catch(() => {}),
      receive: () => receiveAudio.play().catch(() => {}),
      delete: () => deleteAudio.play().catch(() => {})
    };
  });

  const debouncedTyping = useMemo(() => 
    debounce((typing) => {
      if (typing) {
        socket.emit('typing', username);
      } else {
        socket.emit('stopTyping');
      }
    }, 300), 
    [username, socket]
  );

  const [isRecording, setIsRecording] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const audioChunksRef = useRef([]);

  const [isServerLoading, setIsServerLoading] = useState(false);

  // Add this state to track message positions
  const [messagePositions, setMessagePositions] = useState({});

  // Add audio preview state
  const [audioPreview, setAudioPreview] = useState(null);

  // Add these state variables
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Add this function to handle scroll and load more messages
  const handleScroll = useCallback(
    debounce(async () => {
      const container = chatContainerRef.current;
      if (!container || isLoadingMore || !hasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);

      if (scrollTop < 50) {
        setIsLoadingMore(true);
        try {
          const response = await axios.get(`${API_URL}/api/messages?page=${page + 1}`);
          if (response.data.messages?.length) {
            const oldHeight = container.scrollHeight;
            setMessages(prev => [...response.data.messages, ...prev]);
            setPage(p => p + 1);
            setHasMore(response.data.hasMore);
            
            requestAnimationFrame(() => {
              container.scrollTop = container.scrollHeight - oldHeight;
            });
          } else {
            setHasMore(false);
          }
        } catch (error) {
          console.error('Error loading messages:', error);
        } finally {
          setIsLoadingMore(false);
        }
      }
    }, 150),
    [page, isLoadingMore, hasMore]
  );

  useEffect(() => {
    // Fetch existing messages
    const fetchMessages = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/messages`);
        // Ensure we're setting an array
        setMessages(response.data.messages || []);
      } catch (error) {
        console.error('Error fetching messages:', error);
        setMessages([]); // Set empty array on error
      }
    };

    fetchMessages();

    // Socket event listeners
    socket.on('message', (newMessage) => {
      setMessages(prevMessages => {
        if (!Array.isArray(prevMessages)) return [newMessage];
        return [...prevMessages, newMessage];
      });
    });

    socket.on('messageDeleted', ({ messageId }) => {
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg._id === messageId && msg.type !== 'deleted'
            ? { ...msg, type: 'deleted', text: 'This message was deleted' }
            : msg
        )
      );
      playSound.delete();
    });

    socket.on('previousMessages', (messages) => {
      setMessages(messages);
    });

    socket.on('deleteError', (error) => {
      fetchMessages();
      alert(error.message || 'Error deleting message');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      alert('Failed to connect to the server.');
    });

    socket.on('messageError', (error) => {
      console.error('Message error:', error);
      alert('Failed to send message');
    });

    return () => {
      socket.off('message');
      socket.off('previousMessages');
      socket.off('messageDeleted');
      socket.off('deleteError');
      socket.off('messageError');
    };
  }, [socket, playSound]);

  useEffect(() => {
    if (isLoggedIn) {
    fetchCustomStickers();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;

    // Smooth scroll to bottom on initial load/refresh
    setTimeout(() => {
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
      });
    }, 100); // Small delay to ensure content is rendered

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = chatContainer;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    };

    chatContainer.addEventListener('scroll', handleScroll);
    return () => chatContainer.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;
    
    // Smooth scroll to bottom when messages update
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages]);

  useEffect(() => {
    const organizeMedia = () => {
      const images = [];
      const videos = [];
      const links = [];

      messages.forEach(msg => {
        if (msg.type === 'image') {
          images.push({ url: msg.text, timestamp: msg.timestamp });
        } else if (msg.type === 'video') {
          videos.push({ url: msg.text, timestamp: msg.timestamp });
        } else if (msg.type === 'text') {
          // URL regex pattern
          const urlPattern = /(https?:\/\/[^\s]+)/g;
          const foundLinks = msg.text.match(urlPattern);
          if (foundLinks) {
            links.push(...foundLinks.map(link => ({
              url: link,
              timestamp: msg.timestamp
            })));
          }
        }
      });

      setMediaItems({
        images: images.reverse(),
        videos: videos.reverse(),
        links: links.reverse()
      });
    };

    organizeMedia();
  }, [messages]);

  useEffect(() => {
    socket.emit('userLeave');
    
    socket.emit('userJoin', username);

    socket.on('userTyping', (users) => {
      setTypingUsers(users.filter(user => user !== username));
    });

    return () => {
      socket.emit('stopTyping');
      socket.emit('userLeave');
      socket.off('userTyping');
      debouncedTyping.cancel();
    };
  }, [username, socket, debouncedTyping]);

  useEffect(() => {
    const fetchStickers = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/stickers`);
        setStickerPacks(response.data);
    } catch (error) {
      console.error('Error fetching stickers:', error);
    }
  };
    fetchStickers();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsServerLoading(true);
    const formUsername = e.target.username.value;
    const formPassword = e.target.password.value;

    console.log('Attempting login to:', API_URL);

    try {
      // First try a simple GET request to check server availability
      const serverCheck = await fetch(`${API_URL}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!serverCheck.ok) {
        console.error('Health check failed:', await serverCheck.text());
        throw new Error(`Server health check failed: ${serverCheck.status}`);
      }

      // If server is available, proceed with login
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ 
          username: formUsername, 
          password: formPassword 
        })
      });

      const data = await response.json();
      console.log('Login response:', data);

      if (response.ok) {
        setUsername(formUsername);
        setIsLoggedIn(true);
        localStorage.setItem('username', formUsername);
      } else {
        alert(data.message || 'Login failed');
      }
    } catch (error) {
      console.error('Detailed error:', error);
      if (!navigator.onLine) {
        alert('Please check your internet connection');
      } else {
        alert(`Server connection error: ${error.message}`);
      }
    } finally {
      setIsServerLoading(false);
    }
  };

  const ImagePreview = useMemo(() => {
    return ({ image, onSend, onCancel }) => (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30 p-4">
        <div className="bg-white rounded-xl max-w-lg w-full">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-semibold">Send Image</h3>
            <button 
              onClick={onCancel}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="p-4">
            <div className="relative aspect-video mb-4 bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={image}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={onSend}
                className="px-4 py-2 bg-love text-white rounded-lg hover:bg-love-dark"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, []);

  const sendMessage = async () => {
    if (message.trim() || selectedImage || selectedSticker) {
      try {
        const messageData = {
          username,
          text: selectedSticker || selectedImage || message.trim(),
          type: selectedSticker ? 'sticker' : selectedImage ? 'image' : 'text',
          timestamp: new Date()
        };

        if (replyingTo) {
          messageData.replyTo = {
            _id: replyingTo._id,
            username: replyingTo.username,
            text: replyingTo.text,
            type: replyingTo.type
          };
        }

        console.log('Sending message:', messageData); // Debug log
    socket.emit('sendMessage', messageData);
        
        // Clear staes
        setMessage('');
        setSelectedImage(null);
        setImagePreview(null);
        setSelectedSticker(null);
        setReplyingTo(null);
        setShowStickers(false);
        socket.emit('stopTyping');
        debouncedTyping.cancel();
        
        if (inputRef.current) {
          inputRef.current.focus();
        }
      } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
      }
    }
  };

  const handleDeleteMessage = useCallback(async (messageId) => {
    try {
      const confirmDelete = window.confirm("Are you sure you want to delete this message?");
      if (!confirmDelete) return;

      // Immediately update UI first
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg._id === messageId 
            ? { ...msg, type: 'deleted', text: 'This message was deleted' }
            : msg
        )
      );
      
      // Play delete sound
      playSound.delete();

      // Then emit to server (don't await)
      socket.emit('deleteMessage', { messageId, username });

    } catch (error) {
      console.error('Error deleting message:', error);
      // Optionally revert the UI if there's an error
      // alert('Failed to delete message');
    }
  }, [socket, username, playSound]);

  const sendSticker = (stickerUrl) => {
    console.log('Sending sticker:', stickerUrl);
    const messageData = {
      username,
      text: stickerUrl,
      type: 'custom-sticker'
    };
    
    socket.emit('sendMessage', messageData);
    setShowStickers(false);
  };

  const handleStickerUpload = async (file) => {
    if (!file) return;
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('username', username);
    formData.append('packName', 'My Stickers');

    try {
      const response = await axios.post(`${API_URL}/api/stickers/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      fetchCustomStickers();
      setIsUploadModalOpen(false);
    } catch (error) {
      console.error('Error uploading sticker:', error);
      alert('Failed to upload sticker');
    }
  };

  const fetchCustomStickers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/stickers`, {
        withCredentials: false
      });
      setCustomStickers(response.data);
    } catch (error) {
      console.error('Error fetching stickers:', error);
    }
  };

  const handleImageSelect = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('Image size must be less than 5MB');
      return;
    }

    // Create preview using URL.createObjectURL instead of FileReader
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setSelectedImage(file);
    setShowImageUpload(true);

    // Cleanup the object URL when preview is no longer needed
    return () => URL.revokeObjectURL(previewUrl);
  }, []);

  const handleImageUpload = useCallback(async () => {
    if (!selectedImage) return;

    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append('image', selectedImage);

      const response = await axios.post(`${API_URL}/api/upload-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const messageData = {
        username,
        text: response.data.url,
        type: 'image',
        timestamp: new Date(),
        replyTo: replyingTo ? {
          _id: replyingTo._id,
          username: replyingTo.username,
          text: replyingTo.text,
          type: replyingTo.type
        } : null
      };

      // Emit message before updating state
      socket.emit('sendMessage', messageData);
      playSound.send();

      // Batch state updates
      setSelectedImage(null);
      setImagePreview(null);
      setShowImageUpload(false);
      setReplyingTo(null);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setIsLoading(false);
    }
  }, [selectedImage, username, replyingTo, socket, playSound]);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      setTimeout(() => {
        chatContainerRef.current.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  };

  useEffect(() => {
    if (isLoggedIn && messages.length > 0) {
      scrollToBottom();
    }
  }, [isLoggedIn, messages.length]);

  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;

    const handleScroll = () => {
      const isNearBottom = 
        chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    };

    chatContainer.addEventListener('scroll', handleScroll);
    return () => chatContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Add this useEffect to track message positions
  useEffect(() => {
    const positions = {};
    messages.forEach(msg => {
      const element = document.querySelector(`[data-message-id="${msg._id}"]`);
      if (element) {
        positions[msg._id] = element.offsetTop;
      }
    });
    setMessagePositions(positions);
  }, [messages]);

  // Update the scrollToMessage function
  const scrollToMessage = (messageId) => {
    setTimeout(() => {
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement && chatContainerRef.current) {
        // Get the container and element positions
        const container = chatContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = messageElement.getBoundingClientRect();
        
        // Calculate the scroll position to center the message
        const scrollPosition = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 3);
        
        // Smooth scroll to message
        container.scrollTo({
          top: scrollPosition,
          behavior: 'smooth'
        });

        // Add highlight and scale effect
        messageElement.style.backgroundColor = 'rgba(254, 226, 226, 0.5)';
        messageElement.style.transform = 'scale(1.02)';
        messageElement.style.transition = 'all 0.3s ease';
        
        // Remove effects after animation
        setTimeout(() => {
          messageElement.style.backgroundColor = '';
          messageElement.style.transform = 'scale(1)';
        }, 2000);
      }
    }, 100);
  };

  // Update the handleReply function
  const handleReply = useCallback((message) => {
    setReplyingTo(message);
    // Focus the input field after a short delay to ensure state update
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  }, []);

  // Now define the Message component with access to scrollToMessage
  const Message = React.memo(({ msg, username, onReply, onDelete }) => {
    const [imageLoaded, setImageLoaded] = useState(() => IMAGE_CACHE.has(msg.text));
    const imageRef = useRef(null);
    const [showCopyFeedback, setShowCopyFeedback] = useState(false);
    const pressTimeoutRef = useRef(null);
    const [isPressing, setIsPressing] = useState(false);

    useEffect(() => {
      if (msg.type === 'image' && !IMAGE_CACHE.has(msg.text)) {
        const img = new Image();
        
        img.onload = () => {
          IMAGE_CACHE.set(msg.text, true);
          setImageLoaded(true);
        };
        
        img.src = msg.text;

        return () => {
          img.onload = null;
        };
      }
    }, [msg.type, msg.text]);

    const handleCopyMessage = useCallback(() => {
      if (msg.type !== 'text' && msg.type !== 'link') return;
      
      navigator.clipboard.writeText(msg.text).then(() => {
        setShowCopyFeedback(true);
        setTimeout(() => setShowCopyFeedback(false), 2000);
      });
    }, [msg]);

    const handlePressStart = useCallback((e) => {
      if (msg.type !== 'text' && msg.type !== 'link') return;
      
      // Prevent default to avoid text selection
      e.preventDefault();
      
      setIsPressing(true);
      pressTimeoutRef.current = setTimeout(() => {
        handleCopyMessage();
        setIsPressing(false);
      }, 500); // 500ms press duration
    }, [msg, handleCopyMessage]);

    const handlePressEnd = useCallback(() => {
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current);
      }
      setIsPressing(false);
    }, []);

    const renderMessageContent = () => {
      if (msg.type === 'text' || msg.type === 'link') {
        return (
          <div 
            className={`relative ${isPressing ? 'bg-black/5' : ''} transition-colors rounded`}
            onTouchStart={handlePressStart}
            onTouchEnd={handlePressEnd}
            onTouchCancel={handlePressEnd}
            onMouseDown={handlePressStart}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressEnd}
          >
            <span className="font-inter text-[15px] leading-relaxed">
              {msg.text}
            </span>
            
            {/* Copy feedback tooltip */}
            {showCopyFeedback && (
              <div 
                className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white 
                  px-2 py-1 rounded text-xs whitespace-nowrap animate-fade-in-out"
              >
                Copied to clipboard!
              </div>
            )}
          </div>
        );
      }
      
      if (msg.type === 'image') {
        return (
          <div className="relative rounded-lg overflow-hidden bg-gray-100">
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-love border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {imageLoaded && (
              <img
                ref={imageRef}
                src={msg.text}
                alt="shared"
                className="w-full h-auto max-h-[300px] object-contain"
                style={{ 
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden',
                  contain: 'paint'
                }}
              />
            )}
          </div>
        );
      }
      
      if (msg.type === 'sticker' || msg.type === 'custom-sticker') {
        return (
          <div className="relative w-32 h-32">
            <img
              src={msg.text}
              alt="sticker"
              className="w-full h-full object-contain"
              loading="lazy"
              style={{ 
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden'
              }}
            />
          </div>
        );
      }
      
      if (msg.type === 'deleted') {
        return <span className="italic text-gray-500 font-inter">This message was deleted</span>;
      }
      
      if (msg.type === 'audio') {
        return <AudioPlayer audioUrl={msg.text} />;
      }
      
      return <span className="font-inter text-[15px] leading-relaxed">{msg.text}</span>;
    };

    const handlers = useSwipeable({
      onSwipedRight: () => {
        // Don't allow swipe to reply for deleted messages
        if (msg.type !== 'deleted') {
          onReply(msg);
        }
      },
      delta: 30,
      preventDefaultTouchmoveEvent: true,
      trackMouse: false
    });

    const handleDelete = (e) => {
      e.stopPropagation();
      onDelete(msg._id); // Remove the confirmation here since it's in handleDeleteMessage
    };

    const handleMessageClick = () => {
      if (msg.replyTo?.id) {
        const originalMessage = document.querySelector(`[data-message-id="${msg.replyTo.id}"]`);
        if (!originalMessage || !chatContainerRef.current) return;

        chatContainerRef.current.scrollTo({
          top: originalMessage.offsetTop - chatContainerRef.current.clientHeight / 3,
          behavior: 'smooth'
        });

        originalMessage.classList.add('highlight-message');
        setTimeout(() => {
          originalMessage.classList.remove('highlight-message');
        }, 2000);
      }
    };

    const isDeleted = msg.type === 'deleted';

    return (
      <div 
        {...handlers}
        data-message-id={msg._id}
        className={`flex ${msg.username === username ? 'justify-end' : 'justify-start'} w-full mb-2.5 sm:mb-3.5 px-4 sm:px-8`}
      >
        <div className={`relative max-w-[85%] ${msg.username === username ? 'items-end' : 'items-start'} group`}>
          {/* Reply preview if message is a reply */}
          {msg.replyTo && (
            <div 
              className={`mb-2 ${
                msg.username === username ? 'text-right' : 'text-left'
              } group/reply overflow-hidden`}
            >
              <div 
                onClick={(e) => {
                  // Stop event from bubbling up to prevent parent click handler
                  e.stopPropagation();
                  
                  // Find and scroll to original message
                  const originalMessage = document.querySelector(`[data-message-id="${msg.replyTo.id}"]`);
                  if (!originalMessage || !chatContainerRef.current) return;

                  chatContainerRef.current.scrollTo({
                    top: originalMessage.offsetTop - chatContainerRef.current.clientHeight / 3,
                    behavior: 'smooth'
                  });

                  originalMessage.classList.add('highlight-message');
                  setTimeout(() => {
                    originalMessage.classList.remove('highlight-message');
                  }, 2000);
                }}
                className={`inline-block rounded-lg px-3 py-2 
                  ${msg.username === username 
                    ? 'bg-love/10 text-love hover:bg-love/15' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  } cursor-pointer transition-colors max-w-full`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-3.5 w-3.5 opacity-70 flex-shrink-0"
                    viewBox="0 0 20 20" 
                    fill="currentColor"
                  >
                    <path 
                      fillRule="evenodd" 
                      d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" 
                      clipRule="evenodd" 
                    />
                  </svg>
                  <span className="font-medium truncate">{msg.replyTo.username}</span>
                </div>
                <div className="opacity-75 truncate pl-5 w-full">
                  {msg.replyTo.type === 'sticker' ? (
                    <div className="flex items-center gap-1.5">
                      <Sticker className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">Sticker</span>
                    </div>
                  ) : msg.replyTo.type === 'image' ? (
                    <div className="flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Photo</span>
                    </div>
                  ) : msg.replyTo.type === 'audio' ? (
                    <div className="flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" />
                      <span>Voice message</span>
                    </div>
                  ) : (
                    <span className="line-clamp-1">{msg.replyTo.text}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rest of your existing message component */}
          <div className="text-sm mb-1 flex items-center gap-1.5">
            <span className="font-medium font-inter text-gray-700">{msg.username}</span>
            <span className="text-xs text-gray-400 font-inter">
              {new Date(msg.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          </div>
          
          <div 
            className={`p-3 shadow-sm relative ${
              msg.username === username 
                ? 'bg-love text-white rounded-[20px] rounded-tr-[5px]' 
                : 'bg-white border border-gray-100 text-gray-800 rounded-[20px] rounded-tl-[5px]'
            }`}
          >
            {/* Message Actions */}
            <div className={`absolute ${msg.username === username ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2 
              ${msg.username === username ? '-translate-x-full' : 'translate-x-full'} 
              opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1 px-2`}
            >
              {/* Reply Button - Don't show for deleted messages */}
              {msg.type !== 'deleted' && (
                <button
                  onClick={() => onReply(msg)}
                  className="p-1.5 rounded-full bg-white shadow-md hover:bg-gray-50 transition-colors"
                  title="Reply"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              )}

              {/* Delete Button - Only show for user's own messages */}
              {msg.username === username && msg.type !== 'deleted' && (
                <button
                  onClick={() => onDelete(msg._id)}
                  className="p-1.5 rounded-full bg-white shadow-md hover:bg-gray-50 transition-colors"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            {renderMessageContent()}
          </div>
        </div>
      </div>
    );
  }, (prevProps, nextProps) => {
    return (
      prevProps.msg._id === nextProps.msg._id &&
      prevProps.msg.type === nextProps.msg.type &&
      prevProps.msg.text === nextProps.msg.text &&
      prevProps.username === nextProps.username
    );
  });

  const Sidebar = () => (
    <div className="fixed inset-y-0 right-0 w-72 sm:w-80 bg-white shadow-lg z-50 flex flex-col">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Media & Links</h2>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setSidebarContent('media')}
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            sidebarContent === 'media' 
              ? 'text-love border-b-2 border-love' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <ImageIcon className="w-4 h-4" />
            <span>Media</span>
          </div>
        </button>
        <button
          onClick={() => setSidebarContent('links')}
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            sidebarContent === 'links' 
              ? 'text-love border-b-2 border-love' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Link className="w-4 h-4" />
            <span>Links</span>
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {sidebarContent === 'media' ? (
          <div className="space-y-4">
            {/* Images */}
            {mediaItems.images.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Images</h3>
                <div className="grid grid-cols-2 gap-2">
                  {mediaItems.images.map((item, index) => (
                    <div 
                      key={index}
                      className="aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition"
                      onClick={() => window.open(item.url, '_blank')}
                    >
                      <img 
                        src={item.url} 
                        alt="shared" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Videos */}
            {mediaItems.videos.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Videos</h3>
                <div className="grid grid-cols-2 gap-2">
                  {mediaItems.videos.map((item, index) => (
                    <div 
                      key={index}
                      className="aspect-video rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition"
                      onClick={() => window.open(item.url, '_blank')}
                    >
                      <video 
                        src={item.url}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mediaItems.images.length === 0 && mediaItems.videos.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                No media shared yet
              </div>
            )}
          </div>
        ) : (
          <div>
            {mediaItems.links.length > 0 ? (
              <div className="space-y-2">
                {mediaItems.links.map((item, index) => (
                  <a
                    key={index}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                  >
                    <div className="text-sm text-love break-all">{item.url}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                No links shared yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const handleMessageInput = useCallback((e) => {
    setMessage(e.target.value);
    if (e.target.value.length > 0) {
      debouncedTyping(true);
    } else {
      debouncedTyping.cancel();
      socket.emit('stopTyping');
    }
  }, [debouncedTyping, socket]);

  const StickerPicker = ({ onSelect, onClose }) => {
    const [selectedPack, setSelectedPack] = useState('Recent');
    
    // Combine built-in packs with custom stickers
    const allPacks = {
      Recent: recentStickers.map(url => ({ text: url })),
      ...customStickers
    };

    const handleStickerClick = (sticker) => {
      const stickerText = typeof sticker === 'string' ? sticker : sticker.url || sticker.text;
      
      // Update recent stickers
      setRecentStickers(prev => {
        const newRecent = [stickerText, ...prev.filter(s => s !== stickerText)].slice(0, 12);
        localStorage.setItem('recentStickers', JSON.stringify(newRecent));
        return newRecent;
      });

      // Create message data
      const messageData = {
        username,
        text: stickerText,
        type: 'sticker',
        timestamp: new Date(),
        replyTo: replyingTo || null
      };

      // Send sticker message
      socket.emit('sendMessage', messageData);
      playSound.send();
      setShowStickers(false);
      setReplyingTo(null);
    };

    return (
      <div className="fixed bottom-[72px] left-0 right-0 bg-white border-t shadow-lg z-10">
        <div className="max-w-6xl mx-auto px-2 py-2">
          {/* Pack selector */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin">
            {Object.keys(allPacks).map((packName) => (
              <button
                key={packName}
                onClick={() => setSelectedPack(packName)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors
                  ${selectedPack === packName 
                    ? 'bg-love text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
              >
                {packName}
              </button>
            ))}
          </div>

          {/* Sticker grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 sm:gap-3 max-h-[300px] overflow-y-auto">
            {Array.isArray(allPacks[selectedPack]) && allPacks[selectedPack].map((sticker, index) => (
              <button
                key={index}
                onClick={() => handleStickerClick(sticker)}
                className="aspect-square p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {typeof sticker === 'string' ? (
                  <span className="text-2xl">{sticker}</span>
                ) : (
                  <img 
                    src={sticker.url || sticker.text} 
                    alt="sticker"
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const startRecording = async () => {
    try {
      // First check if we have permission
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'microphone' });
        if (result.state === 'denied') {
          alert('Please enable microphone access in your browser settings');
          return;
        }
      }

      // Add more flexible constraints specifically for mobile
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100,
          sampleSize: 16
        } 
      });
      
      setAudioStream(stream);
      audioChunksRef.current = [];
      
      // Check for supported MIME types
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = ''; // Let the browser choose the best format
        }
      }
      
      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 128000
      });
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        // Don't show alert here, just log the error
        stopRecording();
      };
      
      recorder.onstop = async () => {
        try {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { 
              type: mimeType || 'audio/webm' 
            });
            
            const audioUrl = URL.createObjectURL(audioBlob);
            setAudioPreview({
              url: audioUrl,
              blob: audioBlob
            });
          }
        } catch (error) {
          console.error('Error creating audio preview:', error);
          // Don't show alert here
        }
      };

      // Start recording with smaller time slices for mobile
      recorder.start(200); // 200ms chunks
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      
      if (error.name === 'AbortError') {
        console.log('Recording was aborted, retrying...');
        setIsRecording(false);
      } else if (error.name === 'NotAllowedError') {
        alert('Microphone access was denied. Please check your device permissions.');
      } else if (error.name === 'NotFoundError') {
        alert('No microphone found. Please ensure your device has a working microphone.');
      } else if (error.name === 'NotReadableError') {
        alert('Could not access your microphone. Please try closing other apps that might be using it.');
      } else {
        // Don't show generic error alert
        console.error('Microphone error:', error);
      }
      
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    try {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // Add a small delay before cleaning up the stream
        setTimeout(() => {
          if (audioStream) {
            audioStream.getTracks().forEach(track => {
              track.stop();
            });
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    } finally {
      setIsRecording(false);
      setAudioStream(null);
      setMediaRecorder(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setIsLoggedIn(false);
    setUsername('');
  };

  // Add these functions inside your App component
  const handleAudioSend = useCallback(async () => {
    if (!audioPreview) return;

    try {
      const formData = new FormData();
      formData.append('audio', audioPreview.blob, 'audio.webm');

      const response = await axios.post(`${API_URL}/api/upload-audio`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const messageData = {
        username,
        text: response.data.url,
        type: 'audio',
        timestamp: new Date(),
        replyTo: replyingTo || null
      };

      socket.emit('sendMessage', messageData);
      playSound.send();
      setReplyingTo(null);
    } catch (error) {
      console.error('Error uploading audio:', error);
      alert('Failed to upload audio');
    } finally {
      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
    }
  }, [audioPreview, username, replyingTo, socket, playSound]);

  const renderMessages = useCallback(() => {
    return messages.map(msg => (
      <Message
        key={msg._id}
        msg={msg}
        username={username}
        onReply={handleReply}
        onDelete={handleDeleteMessage}
      />
    ));
  }, [messages, username, handleReply, handleDeleteMessage]);

  useEffect(() => {
    return () => {
      // Cleanup image previews when component unmounts
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
      // Clear image cache if it gets too large
      if (IMAGE_CACHE.size > 100) {
        IMAGE_CACHE.clear();
      }
    };
  }, [imagePreview]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-romantic-light to-love-light flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 w-full max-w-md shadow-xl animate-float">
          <h2 className="text-3xl font-bold text-love-dark text-center mb-8">Varsha & Maddy</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              name="username"
              placeholder="Username"
              required
              className="w-full px-4 py-3 rounded-xl border border-romantic-dark focus:border-love focus:ring-2 focus:ring-love/30 outline-none transition"
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full px-4 py-3 rounded-xl border border-romantic-dark focus:border-love focus:ring-2 focus:ring-love/30 outline-none transition"
            />
            <button 
              type="submit"
              disabled={isServerLoading}
              className={`w-full bg-gradient-to-r from-love to-love-dark text-white py-3 rounded-xl font-semibold 
                ${isServerLoading ? 'opacity-50' : 'hover:opacity-90'} transition-opacity`}
            >
              {isServerLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Starting Server...
                </span>
              ) : (
                'Login 🎀'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col h-screen bg-pattern-love overflow-hidden">
      {/* Header with online users */}
      <header className="bg-white shadow-md px-4 py-3 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl sm:text-2xl font-bold text-love-dark">VM</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {username}
            </span>
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <MessageSquare className="w-5 h-5 text-love" />
            </button>
            <button 
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      {isSidebarOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
          <Sidebar />
        </>
      )}

      {/* Chat Area with typing indicator */}
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full max-w-6xl mx-auto w-full p-2 sm:p-4 pb-[25px] sm:pb-[30px] absolute inset-0">
          <div 
            ref={chatContainerRef}
            className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              transform: 'translateZ(0)',
              willChange: 'transform',
              contain: 'paint layout style',
              scrollBehavior: 'smooth'
            }}
          >
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <div className="w-6 h-6 border-2 border-love border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            {renderMessages()}
          </div>
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button 
          onClick={scrollToBottom}
          className="fixed bottom-[120px] right-4 sm:right-8 bg-love text-white p-2.5 rounded-full shadow-lg hover:bg-love-dark transition-colors z-30"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="fixed bottom-[80px] left-0 right-0 flex justify-center z-20 px-4">
          <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm text-gray-600 shadow-md">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                <span className="animate-bounce">•</span>
                <span className="animate-bounce delay-100">•</span>
                <span className="animate-bounce delay-200">•</span>
              </div>
              <span>
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
              </span>
            </div>
        </div>
        </div>
      )}

      {/* Input area */}
      <div className="sticky bottom-0 bg-white border-t shadow-lg z-25 overflow-hidden">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              {/* Image upload button - moved to left */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Upload Image"
              >
                <ImageIcon className="w-5 h-5 text-gray-500" />
              </button>

              {/* Text input field */}
              <div className="flex-1 bg-gray-100 rounded-2xl p-2">
                <textarea
                  ref={inputRef}
                  value={message}
                  onChange={handleMessageInput}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  className="w-full bg-transparent resize-none outline-none min-h-[40px] max-h-[120px] text-sm"
                  rows={1}
                />
              </div>

              {/* Right side action buttons */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => setShowStickers(!showStickers)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Add Sticker"
                >
                  <Sticker className="w-5 h-5 text-gray-500" />
                </button>

                {/* Audio Recording Button */}
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-2 rounded-lg transition-colors ${
                    isRecording ? 'bg-red-500 text-white' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  title={isRecording ? "Stop Recording" : "Record Audio"}
                >
                  {isRecording ? (
                    <StopCircle className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={sendMessage}
                  className="bg-love hover:bg-love-dark text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Upload Sticker</h3>
              <button 
                onClick={() => setIsUploadModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleStickerUpload(e.target.files[0])}
              className="w-full p-2 border rounded-lg"
            />
            <div className="text-sm text-gray-500 mt-2">
              Supported formats: PNG, JPEG, GIF
            </div>
          </div>
        </div>
      )}

      {/* Image Upload Preview Modal */}
      {showImageUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Send Image</h3>
              <button 
                onClick={() => {
                  setShowImageUpload(false);
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
              <img 
                src={imagePreview} 
                alt="preview" 
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowImageUpload(false);
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleImageUpload}
                disabled={isLoading}
                className="px-4 py-2 bg-love text-white rounded-lg hover:bg-love/90 disabled:opacity-50"
              >
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reply preview */}
      {replyingTo && (
        <div className="fixed bottom-[72px] left-0 right-0 bg-white border-t shadow-sm z-10">
          <div className="max-w-6xl mx-auto px-2 py-2">
            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
              <div className="flex-1 min-w-0 mr-2">
                <div className="text-xs font-medium text-gray-500">
                  Replying to {replyingTo.username}
                </div>
                <div className="text-sm truncate text-gray-600">
                  {replyingTo.type === 'sticker' ? '🌟 Sticker' : 
                   replyingTo.type === 'image' ? '📷 Image' : 
                   replyingTo.type === 'audio' ? '🎤 Audio' : 
                   replyingTo.text}
                </div>
              </div>
              <button 
                onClick={() => setReplyingTo(null)}
                className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
                aria-label="Cancel reply"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticker Picker */}
      {showStickers && (
        <StickerPicker 
          onSelect={setSelectedSticker} 
          onClose={() => setShowStickers(false)} 
        />
      )}

      {/* Audio Preview Modal */}
      {audioPreview && (
        <AudioPreviewModal 
          audioUrl={audioPreview.url}
          onSend={handleAudioSend}
          onCancel={() => {
            URL.revokeObjectURL(audioPreview.url);
            setAudioPreview(null);
          }}
        />
      )}
    </div>
  );
}

export default App;