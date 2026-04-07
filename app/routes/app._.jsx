// app/routes/_.jsx
export const action = async ({ request }) => {
  console.log("⚠️ Root POST caught - this is likely the React Router error source");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  // Just return 200 to prevent the error
  return new Response('OK', { 
    status: 200,
    headers: {
      'Content-Type': 'text/plain'
    }
  });
};

export const loader = async () => {
  return new Response('Root endpoint', { status: 200 });
};