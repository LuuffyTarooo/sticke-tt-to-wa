import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'tiktok-signer-working.p.rapidapi.com';

async function debugRegisterDevice() {
    console.log('--- Cek Endpoint /register_device ---');
    try {
        const res = await axios.post(
            `https://${RAPIDAPI_HOST}/register_device`,
            {
                tiktok_version: '47.6.3',
                device_model: 'Pixel 6',
                os_version: '12'
            },
            {
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': RAPIDAPI_HOST,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ BERHASIL REGISTER DEVICE!');
        console.log(JSON.stringify(res.data, null, 2));

    } catch (error) {
        console.log('❌ GAGAL REGISTER DEVICE!');
        if (error.response) {
            console.log('Status Code:', error.response.status);
            console.log('Response Body:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error Message:', error.message);
        }
    }
}

debugRegisterDevice();