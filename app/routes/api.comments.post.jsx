// app/routes/api.comments.post.jsx
import prisma from "../db.server";

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405 }
    );
  }
  
  try {
    const body = await request.json();
    
    // Validate required fields
    const { productId, rating, comment } = body;
    
    if (!productId) {
      return Response.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }
    
    if (!rating || rating < 1 || rating > 5) {
      return Response.json(
        { success: false, error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }
    
    if (!comment || comment.trim().length < 3) {
      return Response.json(
        { success: false, error: 'Comment must be at least 3 characters' },
        { status: 400 }
      );
    }
    
    // Optional fields
    const { 
      campaignId, 
      customerName, 
      customerEmail, 
      title,
      isVerifiedPurchase = false 
    } = body;
    
    // Get IP address for spam prevention
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    
    // Create the comment
    const comment_record = await prisma.comment.create({
      data: {
        productId,
        campaignId: campaignId || null,
        customerName: customerName || 'Anonymous',
        customerEmail: customerEmail || null,
        rating: parseInt(rating),
        comment: comment.trim(),
        title: title || null,
        status: 'pending', // All new comments start as pending
        isVerifiedPurchase,
        ipAddress
      }
    });
    
    return Response.json({
      success: true,
      data: comment_record,
      message: 'Comment submitted successfully and is pending approval'
    });
    
  } catch (error) {
    console.error('Error creating comment:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}