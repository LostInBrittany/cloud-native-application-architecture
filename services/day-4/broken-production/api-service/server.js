import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3000';

app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'api-service' });
});

// Create order endpoint (orchestrates auth + order creation)
app.post('/api/orders', async (req, res) => {
    try {
        console.log('Received order request:', req.body);

        // Step 1: Authenticate (call auth-service)
        const authResponse = await fetch(`${AUTH_SERVICE_URL}/auth/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: req.headers.authorization || 'default-token' })
        });

        if (!authResponse.ok) {
            return res.status(401).json({ error: 'Authentication failed' });
        }

        const authData = await authResponse.json();
        console.log('Auth validated:', authData);

        // Step 2: Create order (call order-service)
        const orderResponse = await fetch(`${ORDER_SERVICE_URL}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        if (!orderResponse.ok) {
            const errorText = await orderResponse.text();
            console.error('Order creation failed:', errorText);
            return res.status(500).json({ error: 'Order creation failed', details: errorText });
        }

        const orderData = await orderResponse.json();
        console.log('Order created:', orderData);

        res.json({
            success: true,
            order: orderData,
            message: 'Order created successfully'
        });

    } catch (error) {
        console.error('API error:', error.message);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Get orders endpoint (simple proxy)
app.get('/api/orders', async (req, res) => {
    try {
        const response = await fetch(`${ORDER_SERVICE_URL}/orders`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

app.listen(PORT, () => {
    console.log(JSON.stringify({
        msg: 'API Service started',
        port: PORT,
        authServiceUrl: AUTH_SERVICE_URL,
        orderServiceUrl: ORDER_SERVICE_URL
    }));
});
