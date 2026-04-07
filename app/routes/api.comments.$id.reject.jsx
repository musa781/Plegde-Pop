// app/routes/api.comments.$id.reject.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ params, request }) {
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
        status: 'rejected'
      }
    });
    
    return Response.json({
      success: true,
      data: comment,
      message: 'Comment rejected'
    });
    
  } catch (error) {
    console.error('Error rejecting comment:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}