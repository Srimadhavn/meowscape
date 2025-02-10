import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { X, ChevronDown, Camera, Image as ImageIcon, Link, MessageSquare, Send, Sticker, Reply, Play, Pause, Mic, StopCircle, Trash2 } from 'lucide-react';
import './App.css';
import './styles/patterns.css';
import debounce from 'lodash/debounce';
import { useSwipeable } from 'react-swipeable';

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
  const videoRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
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
      setMessages((prevMessages) => 
        prevMessages.map(msg => 
          msg._id === messageId 
            ? { ...msg, type: 'deleted', text: 'This message was deleted' }
            : msg
        )
      );
    });

    socket.on('previousMessages', (messages) => {
      setMessages(messages);
    });

    socket.on('deleteError', (error) => {
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
  }, [socket]);

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

  const ImagePreview = ({ image, onSend, onCancel }) => {
    return (
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
  };

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
        socket.emit('deleteMessage', { messageId, username });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }, [socket, username]);

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

  const handleImageSelect = async (event) => {
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

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
      setSelectedImage(file);
      setShowImageUpload(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraStart = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setShowCamera(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Failed to access camera. Please make sure you have granted camera permissions.');
    }
  };

  const handleCameraCapture = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    
    // Set canvas size to match video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw the video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) {
        alert('Failed to capture image');
        return;
      }

      try {
        const formData = new FormData();
        formData.append('image', blob, 'camera-capture.jpg');

        const response = await axios.post(`${API_URL}/api/upload-image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        // Send message with captured image
    const messageData = {
      username,
          text: response.data.url,
          type: 'image',
          timestamp: new Date(),
          replyTo: replyingTo || null
    };
    
    socket.emit('sendMessage', messageData);
        
        // Clean up
        stopCamera();
        setShowCamera(false);
        setReplyingTo(null);
      } catch (error) {
        console.error('Error uploading camera image:', error);
        alert('Failed to upload image');
      }
    }, 'image/jpeg', 0.8);
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleImageUpload = async () => {
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

      socket.emit('sendMessage', messageData);
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
  };

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

  // Update the handleReplyClick function
  const handleReplyClick = (replyId) => {
    if (!replyId) return;
    
    // Find the original message element
    const originalMessage = document.querySelector(`[data-message-id="${replyId}"]`);
    if (!originalMessage || !chatContainerRef.current) return;

    // Scroll the original message into view
    chatContainerRef.current.scrollTo({
      top: originalMessage.offsetTop - chatContainerRef.current.clientHeight / 3,
      behavior: 'smooth'
    });

    // Add highlight effect to the original message
    originalMessage.style.backgroundColor = '#FFE4E4'; // Light red background
    originalMessage.style.transition = 'background-color 0.3s ease';

    // Remove highlight after animation
    setTimeout(() => {
      originalMessage.style.backgroundColor = '';
    }, 1500);
  };

  // Now define the Message component with access to scrollToMessage
  const Message = React.memo(({ msg, username, onReply, onDelete }) => {
    const handlers = useSwipeable({
      onSwipedRight: () => onReply(msg),
      delta: 30,
      preventDefaultTouchmoveEvent: true,
      trackMouse: false
    });

    const handleDelete = async (e) => {
      e.stopPropagation();

      // Prompt for confirmation before deleting
      const confirmDelete = window.confirm("Are you sure you want to delete this message?");
      if (!confirmDelete) return;

      try {
        await onDelete(msg._id);
      } catch (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message.');
      }
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

    return (
      <div 
        {...handlers}
        className={`flex ${msg.username === username ? 'justify-end' : 'justify-start'} w-full mb-2 sm:mb-3 px-4 sm:px-8`}
      >
        <div 
          onClick={handleMessageClick}
          data-message-id={msg._id}
          className={`relative max-w-[88%] xs:max-w-[85%] sm:max-w-[75%] group
            ${msg.username === username ? 'message-gradient' : 'message-white'} 
            rounded-xl sm:rounded-2xl p-2.5 sm:p-3 shadow-lg transition-transform duration-200`}
        >
          {/* Reply Preview */}
          {msg.replyTo && (
            <div 
              className={`
                relative mb-2 p-2 rounded-lg cursor-pointer overflow-hidden
                ${msg.username === username ? 'reply-preview' : 'reply-preview-light'}
              `}
            >
              <div className="relative z-10">
                <div className={`text-xs ${msg.username === username ? 'text-white/90' : 'text-gray-500'}`}>
                  Replying to {msg.replyTo.username}
                </div>
                <div className="mt-1 text-sm truncate flex items-center gap-1.5">
                  {msg.replyTo.type === 'sticker' ? (
                    <div className="w-4 h-4">
                      <img 
                        src={msg.replyTo.text} 
                        alt="sticker"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : msg.replyTo.type === 'image' ? (
                    <span className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      Photo
                    </span>
                  ) : msg.replyTo.type === 'audio' ? (
                    <span className="flex items-center gap-1">
                      <Mic className="w-3 h-3" />
                      Audio Message
                    </span>
                  ) : (
                    <span className={msg.username === username ? 'text-white/90' : 'text-gray-600'}>
                      {msg.replyTo.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Message Header */}
          <div className="flex justify-between items-center text-xs sm:text-sm mb-1">
            <span className={`font-medium ${msg.username === username ? 'text-white/95' : 'text-gray-900'}`}>
              {msg.username}
            </span>
            <span className={`text-[10px] sm:text-xs ml-2 ${msg.username === username ? 'text-white/80' : 'text-gray-500'}`}>
              {new Date(msg.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          </div>

          {/* Message Content */}
          <div className="min-w-0">
            {msg.type === 'deleted' ? (
              <p className={`text-sm italic ${msg.username === username ? 'text-white/70' : 'text-gray-500'}`}>
                This message was deleted
              </p>
            ) : msg.type === 'sticker' ? (
              <div className="w-20 h-20 xs:w-24 xs:h-24 sm:w-28 sm:h-28 flex items-center justify-center">
                <img 
                  src={msg.text} 
                  alt="sticker"
                  className="max-w-full max-h-full object-contain"
                  loading="lazy"
                />
              </div>
            ) : msg.type === 'image' ? (
              <div 
                className="relative max-w-full rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => window.open(msg.text, '_blank')}
              >
                <img 
                  src={msg.text} 
                  alt="shared"
                  className="w-full h-auto max-h-[300px] object-contain"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </div>
            ) : msg.type === 'audio' ? (
              <div className="max-w-full">
                <AudioPlayer audioUrl={msg.text} />
              </div>
            ) : (
              <p className={`text-sm sm:text-base break-words ${msg.username === username ? 'text-white/95' : 'text-gray-800'}`}>
                {msg.text}
              </p>
            )}
          </div>

          {/* Action Buttons - Updated visibility for mobile/desktop */}
          <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-0 
            group-hover:opacity-100 
            md:group-hover:opacity-100 
            md:opacity-0
            sm:group-hover:opacity-100 
            active:opacity-100 
            transition-opacity
            touch-device:hidden"
          >
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onReply(msg);
              }}
              className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50"
            >
              <Reply className="w-4 h-4 text-gray-500" />
            </button>
            {msg.username === username && (
              <button 
                onClick={handleDelete}
                className="p-2 bg-white rounded-full shadow-md hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }, (prevProps, nextProps) => {
    return (
      prevProps.msg._id === nextProps.msg._id &&
      prevProps.username === nextProps.username &&
      prevProps.msg.type === nextProps.msg.type
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

  const handleReply = (message) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  };

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

      onSelect(stickerText);
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      setAudioStream(stream);
      audioChunksRef.current = [];
      
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          // Create preview URL
          const audioUrl = URL.createObjectURL(audioBlob);
          setAudioPreview({
            url: audioUrl,
            blob: audioBlob
          });
          
        } catch (error) {
          console.error('Error creating audio preview:', error);
          alert('Failed to create audio preview');
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
    
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setIsLoggedIn(false);
    setUsername('');
  };

  const CameraModal = () => {
    return (
      <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
        {/* Camera Header */}
        <div className="p-4 flex justify-between items-center">
          <button 
            onClick={() => {
              stopCamera();
              setShowCamera(false);
            }}
            className="text-white p-2 hover:bg-white/10 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
          <span className="text-white font-medium">Take Photo</span>
          <div className="w-10" /> {/* Spacer for alignment */}
        </div>

        {/* Camera Preview */}
        <div className="flex-1 flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="max-h-full max-w-full object-contain"
          />
        </div>

        {/* Camera Controls */}
        <div className="p-6 flex justify-center">
          <button
            onClick={handleCameraCapture}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center"
            aria-label="Take photo"
          >
            <div className="w-14 h-14 rounded-full border-4 border-love" />
          </button>
        </div>
      </div>
    );
  };

  // First, memoize the subscribeToNotifications function
  const subscribeToNotifications = useCallback(async () => {
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.REACT_APP_VAPID_PUBLIC_KEY
        });

        // Send subscription to server
        await axios.post(`${API_URL}/api/subscribe`, {
          subscription,
          username
        });

        console.log('Successfully subscribed to push notifications');
      }
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
    }
  }, [username]);

  // Then update the useEffect
  useEffect(() => {
    if (isLoggedIn) {
      subscribeToNotifications();
    }
  }, [isLoggedIn, subscribeToNotifications]);

  // Add this effect to handle selected stickers
  useEffect(() => {
    if (selectedSticker) {
      const messageData = {
        type: 'sticker',
        text: selectedSticker,
        username: username,
        timestamp: new Date(),
        replyTo: replyingTo ? {
          _id: replyingTo._id,
          username: replyingTo.username,
          text: replyingTo.text,
          type: replyingTo.type
        } : null
      };
      socket.emit('sendMessage', messageData);
      setSelectedSticker(null);
    setShowStickers(false);
      setReplyingTo(null);
    }
  }, [selectedSticker, username, socket, replyingTo]);

  const renderMessages = useMemo(() => {
    if (!Array.isArray(messages)) return null;
    
    return messages.map((msg, index) => (
      <Message 
        key={msg._id || index}
        msg={msg}
        username={username}
        onReply={handleReply}
        onDelete={handleDeleteMessage}
      />
    ));
  }, [messages, username, handleReply, handleDeleteMessage]);

  // Add AudioPreviewModal component
  const AudioPreviewModal = ({ audioUrl, onSend, onCancel }) => {
    const [isSending, setIsSending] = useState(false);

    const handleSend = async () => {
      setIsSending(true);
      await onSend();
      setIsSending(false);
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-sm w-full p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Send Voice Message</h3>
            <button 
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700"
              disabled={isSending}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="mb-4">
            <AudioPlayer audioUrl={audioUrl} />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isSending}
              className="px-4 py-2 bg-love text-white rounded-lg hover:bg-love/90 disabled:opacity-50"
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add function to handle audio send
  const handleAudioSend = async () => {
    if (!audioPreview?.blob) return;

    try {
      setIsLoading(true);
      const formData = new FormData();
      formData.append('audio', audioPreview.blob, 'audio.webm');

      const response = await axios.post(`${API_URL}/api/upload-audio`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.url) {
        socket.emit('sendMessage', {
          type: 'audio',
          text: response.data.url,
          username: username,
          timestamp: new Date(),
          replyTo: replyingTo ? {
            _id: replyingTo._id,
            username: replyingTo.username,
            text: replyingTo.text,
            type: replyingTo.type
          } : null
        });
        setReplyingTo(null);
      }
    } catch (error) {
      console.error('Error uploading audio:', error);
      alert('Failed to upload audio message');
    } finally {
      setIsLoading(false);
      setAudioPreview(null);
    }
  };

  // Add this function to fetch message history
  const fetchMessageHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/messages/history`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching message history:', error);
    }
  };

  // Add error boundaries
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });

  // Add offline handling
  window.addEventListener('offline', () => {
    alert('You are offline. Please check your internet connection.');
  });

  // Add reconnection handling
  socket.on('connect_error', () => {
    console.log('Attempting to reconnect...');
  });

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
          <h1 className="text-xl sm:text-2xl font-bold text-love-dark">Varsha & Maddy</h1>
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
            className="h-full overflow-y-auto overscroll-y-contain rounded-xl sm:rounded-2xl p-2 sm:p-4 space-y-3 sm:space-y-4"
            style={{ 
              WebkitOverflowScrolling: 'touch',
              willChange: 'transform',
              transform: 'translateZ(0)'
            }}
          >
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <div className="w-6 h-6 border-2 border-love border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            {renderMessages}
          </div>
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
                  <button 
          onClick={scrollToBottom}
          className="fixed bottom-[100px] right-4 sm:right-8 bg-love text-white p-2 rounded-full shadow-lg hover:bg-love-dark transition-colors z-20"
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
      <div className="sticky bottom-0 bg-white border-t shadow-lg z-20">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2">
          <div className="flex flex-col gap-2">
            {/* Input area */}
            <div className="flex items-end gap-2">
              {/* Camera button - moved to left */}
              <button
                onClick={handleCameraStart}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Take Photo"
              >
                <Camera className="w-5 h-5 text-gray-500" />
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

      {/* Camera Modal */}
      {showCamera && <CameraModal />}

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
