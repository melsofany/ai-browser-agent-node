
import axios from 'axios';

async function triggerPush() {
  try {
    console.log('Triggering push via API...');
    const response = await axios.post('http://localhost:3000/api/push');
    console.log('Push Result:', response.data);
  } catch (error: any) {
    console.error('API Call Failed:', error.response?.data || error.message);
  }
}

triggerPush();
