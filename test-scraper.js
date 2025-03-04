import axios from 'axios';
import cheerio from 'cheerio';

/**
 * Scrapes content from a URL
 */
async function scrapeUrl(url) {
  try {
    console.log(`Scraping URL: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000, // 10 second timeout
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'No title found';
    
    // Extract description
    const description = $('meta[name="description"]').attr('content') || 
                      $('meta[property="og:description"]').attr('content') || 
                      $('p').first().text().trim().substring(0, 200) || 
                      'No description found';
    
    // Extract main content
    // First try to find main content containers
    let contentSelectors = ['article', 'main', '.content', '#content', '.post', '.article'];
    let content = '';
    
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().trim();
        break;
      }
    }
    
    // If no content found, extract from paragraphs
    if (!content) {
      content = $('p').map((_, el) => $(el).text().trim()).get().join('\n\n');
    }
    
    // If still no content, get body text
    if (!content) {
      content = $('body').text().trim();
    }
    
    // Clean up content
    content = content
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 1000); // Limit content length for display
    
    console.log('Scraping successful!');
    console.log('Title:', title);
    console.log('Description:', description);
    console.log('Content preview:', content.substring(0, 300) + '...');
    
    return {
      title,
      description,
      content,
      url
    };
  } catch (error) {
    console.error('Error scraping URL:', error.message);
    
    return {
      title: 'Error',
      description: 'Failed to scrape URL',
      content: `Failed to scrape URL: ${error.message}`,
      url
    };
  }
}

// Test with example.com
scrapeUrl('https://www.example.com')
  .then(() => {
    console.log('\nTesting with another URL...\n');
    return scrapeUrl('https://developer.mozilla.org/en-US/docs/Web/JavaScript');
  })
  .catch(error => {
    console.error('Unhandled error:', error);
  }); 