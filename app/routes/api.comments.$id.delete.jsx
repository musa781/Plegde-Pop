// app/routes/api.comments.$id.delete.jsx
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ params, request }) {
  if (request.method !== 'DELETE') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405 }
    );
  }
  
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
    await prisma.comment.delete({
      where: { id }
    });
    
    return Response.json({
      success: true,
      message: 'Comment deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting comment:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}