// app/routes/api.comments.campaign.$campaignId.jsx
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ params, request }) {
  const { campaignId } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const status = url.searchParams.get('status') || 'approved';
  console.log(status);
  

  
  try {
    // Try to authenticate (for admin views)
    let session = null;
    try {
      const auth = await authenticate.admin(request);
      session = auth.session;
    } catch (e) {
      // Not authenticated - that's fine for public views
    }
    
    // If admin, can see all comments; otherwise only approved
    const isAdmin = !!session;
    
    const comments = await prisma.comment.findMany({
      where: {
        campaignId: campaignId,
        ...(isAdmin ? {} : { status: 'approved' })
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    });
    
    const totalComments = await prisma.comment.count({
      where: {
        campaignId: campaignId,
        ...(isAdmin ? {} : { status: 'approved' })
      }
    });
    
    // Calculate average rating
    const ratingAggregation = await prisma.comment.aggregate({
      where: {
        campaignId: campaignId,
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
    console.error('Error fetching campaign comments:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}