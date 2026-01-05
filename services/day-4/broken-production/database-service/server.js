import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;
const DB_NAME = process.env.DB_NAME; // BUG: Required but not set in manifest!
const CHAOS_FAILURE_RATE = parseFloat(process.env.CHAOS_FAILURE_RATE || '0');

app.use(express.json());

// BUG: Crash if DB_NAME is not set
if (!DB_NAME) {
    console.error('FATAL: DB_NAME environment variable is required!');
    process.exit(1); // Will cause CrashLoopBackOff
}

// In-memory "database"
const database = {
    name: DB_NAME,
    orders: [],
    initialized: Date.now()
};

console.log(`Database initialized: ${DB_NAME}`);

// Chaos engineering: randomly fail requests
function maybeInjectChaos() {
    if (CHAOS_FAILURE_RATE > 0 && Math.random() < CHAOS_FAILURE_RATE) {
        return true;
    }
    return false;
}

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'database-service',
        database: DB_NAME,
        orderCount: database.orders.length,
        chaosEnabled: CHAOS_FAILURE_RATE > 0
    });
});

// Store order endpoint
app.post('/store', (req, res) => {
    // BUG: Chaos mode - randomly fail 50% of requests
    if (maybeInjectChaos()) {
        console.error('CHAOS: Simulated database failure');
        return res.status(500).json({
            error: 'Database temporarily unavailable',
            chaos: true
        });
    }

    const order = {
        ...req.body,
        storedAt: new Date().toISOString()
    };

    database.orders.push(order);
    console.log(`Order stored: ${order.id}`);

    res.json({
        success: true,
        order: order,
        totalOrders: database.orders.length
    });
});

// Get all orders endpoint
app.get('/orders', (req, res) => {
    if (maybeInjectChaos()) {
        console.error('CHAOS: Simulated database failure');
        return res.status(500).json({
            error: 'Database temporarily unavailable',
            chaos: true
        });
    }

    res.json({
        database: DB_NAME,
        orders: database.orders,
        count: database.orders.length
    });
});

// Get single order
app.get('/orders/:id', (req, res) => {
    if (maybeInjectChaos()) {
        return res.status(500).json({ error: 'Database error', chaos: true });
    }

    const order = database.orders.find(o => o.id === req.params.id);
    if (!order) {
        return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
});

// Debug endpoint
app.get('/debug/chaos', (req, res) => {
    res.json({
        chaosEnabled: CHAOS_FAILURE_RATE > 0,
        failureRate: CHAOS_FAILURE_RATE,
        message: CHAOS_FAILURE_RATE > 0
            ? `⚠️  ${CHAOS_FAILURE_RATE * 100}% of requests will fail randomly!`
            : 'Chaos mode disabled'
    });
});

app.listen(PORT, () => {
    console.log(JSON.stringify({
        msg: 'Database Service started',
        port: PORT,
        database: DB_NAME,
        chaosFailureRate: CHAOS_FAILURE_RATE,
        warning: CHAOS_FAILURE_RATE > 0 ? 'CHAOS MODE ENABLED!' : null
    }));
});
