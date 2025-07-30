require('dotenv').config();
const { getUserData, saveUserData, fetchSellerInventory, checkAllUsers } = require('./utils/keepaClient');
const { formatProductNotification } = require('./utils/messageUtils');
const { getSellerProducts } = require('./utils/amazon_bridge');
const fs = require('fs');
const path = require('path');

// Mock Discord client for testing
const mockClient = {
    users: {
        cache: new Map(),
        async fetch(userId) {
            return {
                id: userId,
                tag: `TestUser#${userId.substring(0, 4)}`,
                async send(message) {
                    console.log(`\n📩 DM TO USER ${userId}:`);
                    console.log(`${message}\n`);
                    return { id: 'mock-message-id' };
                }
            };
        }
    },
    channels: {
        cache: {
            get(channelId) {
                return {
                    isTextBased: () => true,
                    async send(message) {
                        console.log(`\n📢 CHANNEL MESSAGE TO ${channelId}:`);
                        console.log(`${message}\n`);
                        return { id: 'mock-message-id' };
                    }
                };
            }
        }
    }
};

// Test parameters
const TEST_USER_ID = '123456789012345678';
const TEST_SELLER_ID = 'A3EH2U557HPK44';

async function runTests() {
    console.log('\n🧪 Starting Bot Tests 🧪\n');

    try {
        // Test 1: Get User Data
        console.log('Test 1: Get User Data');
        const userData = getUserData(TEST_USER_ID);
        console.log(`User membership: ${userData.membership}`);
        console.log(`Tracked sellers: ${userData.trackedSellers.join(', ')}`);
        console.log(`Seen ASINs: ${Object.keys(userData.seenASINs).length} seller(s)`);
        
        // Test 2: Fetch Seller Inventory
        console.log('\nTest 2: Fetch Seller Inventory');
        console.log(`Fetching inventory for seller ${TEST_SELLER_ID}...`);
        const products = await fetchSellerInventory(TEST_SELLER_ID);
        console.log(`Found ${products.length} products`);
        
        if (products.length > 0) {
            console.log(`\nSample product: ${products[0].title.substring(0, 50)}...`);
            console.log(`ASIN: ${products[0].asin}`);
            console.log(`Price: ${products[0].price_text || 'N/A'}`);
            
            // Test formatted notification
            const formattedMsg = formatProductNotification(products[0], TEST_SELLER_ID);
            console.log('\nSample formatted notification:');
            console.log(formattedMsg);
        }
        
        // Test 3: Simulate New Product Detection
        console.log('\nTest 3: Simulate New Product Detection');
        const userDataPath = path.join(__dirname, 'data/userData.json');
        const dataBackup = fs.readFileSync(userDataPath, 'utf8');
        
        try {
            // Modify user data to clear seen ASINs (to simulate new products)
            userData.seenASINs[TEST_SELLER_ID] = [];
            saveUserData();
            console.log('Cleared seen ASINs to simulate new products');
            
            // Run the check
            console.log('Running checkAllUsers to test notification system...');
            await checkAllUsers(mockClient);
            
            console.log('\n✅ Test completed. Check the DM outputs above to verify notifications were sent.');
        } finally {
            // Restore original data
            fs.writeFileSync(userDataPath, dataBackup);
            console.log('Restored original user data');
        }
        
        // Test 4: Test Direct Amazon Scraper
        console.log('\nTest 4: Direct Amazon Scraper Test');
        console.log('Testing with force refresh to bypass cache...');
        const directProducts = await getSellerProducts(TEST_SELLER_ID, 'co.uk', true);
        console.log(`Direct scraper found ${directProducts.length} products`);
        
        if (directProducts.length > 0) {
            console.log(`\nSample direct product: ${directProducts[0].title.substring(0, 50)}...`);
            console.log(`ASIN: ${directProducts[0].asin}`);
        }
        
    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
    }
}

// Run all tests
runTests().then(() => {
    console.log('\n🏁 Testing complete');
}).catch(console.error);