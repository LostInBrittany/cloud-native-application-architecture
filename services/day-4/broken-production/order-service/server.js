import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'http://database-service:8080';
const NOTIFICATION_URL = process.env.NOTIFICATION_URL || 'http://notification-service:3000';

app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'order-service' });
});

// BUG: Aggressive retry without backoff
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            // BUG: No backoff! Retries immediately
            console.log(`Retry ${i + 1}/${maxRetries} for ${url}`);
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            // BUG: No delay between retries - hammers the service
        }
    }
    throw new Error(`Failed after ${maxRetries} retries`);
}

// Create order endpoint
app.post('/orders', async (req, res) => {
    try {
        const orderData = {
            id: `order-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            item: req.body.item || 'unknown',
            quantity: req.body.quantity || 1,
            timestamp: new Date().toISOString()
        };

        console.log('Creating order:', orderData);

        // Step 1: Save to database (will fail due to wrong URL)
        try {
            const dbResponse = await fetchWithRetry(`${DATABASE_URL}/store`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });

            const dbData = await dbResponse.json();
            console.log('Order saved to database:', dbData);
        } catch (error) {
            console.error('Database save failed:', error.message);
            return res.status(500).json({
                error: 'Failed to save order to database',
                details: error.message
            });
        }

        // Step 2: Send notification
        try {
            await fetchWithRetry(`${NOTIFICATION_URL}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'order_created',
                    order: orderData
                })
            });
            console.log('Notification sent');
        } catch (error) {
            console.error('Notification failed (non-critical):', error.message);
            // Continue even if notification fails
        }

        res.json({
            success: true,
            order: orderData,
            message: 'Order created successfully'
        });

    } catch (error) {
        console.error('Order creation error:', error.message);
        res.status(500).json({
            error: 'Failed to create order',
            message: error.message
        });
    }
});

// Get all orders endpoint
app.get('/orders', async (req, res) => {
    try {
        const response = await fetch(`${DATABASE_URL}/orders`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Failed to fetch orders:', error.message);
        res.status(500).json({
            error: 'Failed to fetch orders',
            orders: []
        });
    }
});

app.listen(PORT, () => {
    console.log(JSON.stringify({
        msg: 'Order Service started',
        port: PORT,
        databaseUrl: DATABASE_URL,
        notificationUrl: NOTIFICATION_URL,
        warning: 'Retry logic has no backoff!'
    }));
});
