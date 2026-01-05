import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Store notifications in memory
const notifications = [];

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'notification-service',
        notificationsSent: notifications.length
    });
});

// Send notification endpoint
app.post('/notify', (req, res) => {
    const notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: req.body.type || 'unknown',
        order: req.body.order,
        timestamp: new Date().toISOString(),
        status: 'sent'
    };

    notifications.push(notification);

    console.log(`Notification sent: ${notification.type} for order ${notification.order?.id}`);

    // Simulate sending to external webhook (just log it)
    console.log('Webhook payload:', JSON.stringify(notification, null, 2));

    res.json({
        success: true,
        notification: notification,
        message: 'Notification sent successfully'
    });
});

// Get all notifications (for debugging)
app.get('/notifications', (req, res) => {
    res.json({
        notifications: notifications,
        count: notifications.length
    });
});

app.listen(PORT, () => {
    console.log(JSON.stringify({
        msg: 'Notification Service started',
        port: PORT
    }));
});
