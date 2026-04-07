// app/routes/api.comments.$id.approve.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ params, request }) {
  // Only authenticated admin can approve comments
  try {
    await authenticate.admin(request);
  } catch (e) {
    return Response.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  const { id } = params;
  
  try {
    const comment = await prisma.comment.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date()
      }
    });
    
    return Response.json({
      success: true,
      data: comment,
      message: 'Comment approved'
    });
    
  } catch (error) {
    console.error('Error approving comment:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}