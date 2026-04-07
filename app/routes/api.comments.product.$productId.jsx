// app/routes/api.comments.product.$productId.jsx
import prisma from "../db.server";

export async function loader({ params, request }) {
  const { productId } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const skip = (page - 1) * limit;
  
  try {
    // Get approved comments for this product
    const comments = await prisma.comment.findMany({
      where: {
        productId: productId,
        status: 'approved'
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit,
      select: {
        id: true,
        customerName: true,
        rating: true,
        comment: true,
        title: true,
        createdAt: true,
        isVerifiedPurchase: true
      }
    });
    
    // Get total count for pagination
    const totalComments = await prisma.comment.count({
      where: {
        productId: productId,
        status: 'approved'
      }
    });
    
    // Calculate average rating
    const ratingAggregation = await prisma.comment.aggregate({
      where: {
        productId: productId,
        status: 'approved'
      },
      _avg: {
        rating: true
      },
      _count: {
        rating: true
      }
    });
    
    return Response.json({
      success: true,
      data: {
        comments,
        pagination: {
          page,
          limit,
          total: totalComments,
          pages: Math.ceil(totalComments / limit)
        },
        rating: {
          average: ratingAggregation._avg.rating || 0,
          count: ratingAggregation._count.rating || 0
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching comments:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}