/* eslint-disable react/prop-types */
// app/routes/app.comments.jsx
import { useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const status = url.searchParams.get('status') || 'pending';
  const search = url.searchParams.get('search') || '';
  const limit = 20;
  const skip = (page - 1) * limit;

  if (!session) {
    console.error('❌ No session found - authentication failed');
    throw new Error('Authentication required');
  }
  
  console.log('✅ Admin authenticated for shop:', session.shop);
  
  // Build where clause
  const where = { status };
  if (search) {
    where.OR = [
      { customerName: { contains: search } },
      { comment: { contains: search } },
      { title: { contains: search } },
      { productId: { contains: search } }
    ];
  }
  
  // Get comments with pagination
  const comments = await prisma.comment.findMany({
    where,
    include: {
      campaign: {
        select: {
          id: true,
          campaignTitle: true,
          productTitle: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit
  });
  
  // Get total count for pagination
  const totalComments = await prisma.comment.count({ where });
  
  // Get statistics for dashboard
  const stats = {
    pending: await prisma.comment.count({ where: { status: 'pending' } }),
    approved: await prisma.comment.count({ where: { status: 'approved' } }),
    rejected: await prisma.comment.count({ where: { status: 'rejected' } }),
    total: await prisma.comment.count(),
    averageRating: await prisma.comment.aggregate({
      where: { status: 'approved' },
      _avg: { rating: true }
    })
  };
  
  return {
    comments,
    pagination: {
      page,
      limit,
      total: totalComments,
      pages: Math.ceil(totalComments / limit)
    },
    stats,
    currentStatus: status,
    currentSearch: search
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get('action');
  const commentId = formData.get('commentId');

  console.log('✅ Admin authenticated for shop:', session.shop);

  
  try {
    if (action === 'approve') {
      await prisma.comment.update({
        where: { id: commentId },
        data: { 
          status: 'approved',
          approvedAt: new Date()
        }
      });
      
      return { success: true, message: 'Comment approved' };
    }
    
    if (action === 'reject') {
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'rejected' }
      });
      
      return { success: true, message: 'Comment rejected' };
    }
    
    if (action === 'delete') {
      await prisma.comment.delete({
        where: { id: commentId }
      });
      
      return { success: true, message: 'Comment deleted' };
    }
    
    if (action === 'bulk-approve') {
      const commentIds = formData.getAll('commentIds[]');
      await prisma.comment.updateMany({
        where: { id: { in: commentIds } },
        data: { 
          status: 'approved',
          approvedAt: new Date()
        }
      });
      return { success: true, message: `${commentIds.length} comments approved` };
    }
    
    if (action === 'bulk-reject') {
      const commentIds = formData.getAll('commentIds[]');
      await prisma.comment.updateMany({
        where: { id: { in: commentIds } },
        data: { status: 'rejected' }
      });
      return { success: true, message: `${commentIds.length} comments rejected` };
    }
    
    if (action === 'bulk-delete') {
      const commentIds = formData.getAll('commentIds[]');
      await prisma.comment.deleteMany({
        where: { id: { in: commentIds } }
      });
      return { success: true, message: `${commentIds.length} comments deleted` };
    }
    
    return { success: false, error: 'Invalid action' };
    
  } catch (error) {
    console.error('Error in comment action:', error);
    return { success: false, error: error.message };
  }
}

export default function CommentsAdminPage() {
  // Get data from loader
  const { comments: initialComments, pagination, stats, currentStatus, currentSearch } = useLoaderData();
  
  // State declarations
  const [comments, setComments] = useState(initialComments);
  const [selectedComments, setSelectedComments] = useState([]);
  const [processing, setProcessing] = useState({});
  const [message, setMessage] = useState(null);
  
  const navigate = useNavigate();
  
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedComments(comments.map(c => c.id));
    } else {
      setSelectedComments([]);
    }
  };
  
  const handleSelectComment = (commentId) => {
    setSelectedComments(prev => {
      if (prev.includes(commentId)) {
        return prev.filter(id => id !== commentId);
      } else {
        return [...prev, commentId];
      }
    });
  };
  
  const handleBulkAction = async (action) => {
    if (selectedComments.length === 0) {
      alert('Please select at least one comment');
      return;
    }
    
    if (!confirm(`Are you sure you want to ${action} ${selectedComments.length} comments?`)) {
      return;
    }
    
    setProcessing({ bulk: true });
    
    const formData = new FormData();
    formData.append('action', `bulk-${action}`);
    selectedComments.forEach(id => formData.append('commentIds[]', id));
    
    try {
      const response = await fetch('/app/comments', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update comments in UI
        const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'deleted';
        
        if (action === 'delete') {
          setComments(comments.filter(c => !selectedComments.includes(c.id)));
        } else {
          setComments(comments.map(c => 
            selectedComments.includes(c.id) 
              ? { ...c, status: newStatus }
              : c
          ));
        }
        
        setMessage({ type: 'success', text: data.message });
        setSelectedComments([]);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setProcessing({});
    }
  };
  
  const handleSingleAction = async (commentId, action) => {
    if (!confirm(`Are you sure you want to ${action} this comment?`)) return;
    
    setProcessing(prev => ({ ...prev, [commentId]: true }));
    
    const formData = new FormData();
    formData.append('action', action);
    formData.append('commentId', commentId);
    
    try {
      const response = await fetch('/app/comments', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        // ✅ UI UPDATE WITHOUT REFRESH
        if (action === 'delete') {
          setComments(comments.filter(c => c.id !== commentId));
        } else {
          setComments(comments.map(c => 
            c.id === commentId 
              ? { ...c, status: action === 'approve' ? 'approved' : 'rejected' }
              : c
          ));
        }
        
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setProcessing(prev => ({ ...prev, [commentId]: false }));
    }
  };
  
  const handleSearch = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const search = formData.get('search');
    navigate(`/app/comments?status=${currentStatus}&search=${encodeURIComponent(search)}`);
  };
  
  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: '#fff3cd', color: '#856404', text: 'Pending' },
      approved: { bg: '#d4edda', color: '#155724', text: 'Approved' },
      rejected: { bg: '#f8d7da', color: '#721c24', text: 'Rejected' }
    };
    return styles[status] || styles.pending;
  };
  
  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '30px' }}>Comment Moderation</h1>
      
      {/* Message Display */}
      {message && (
        <div style={{
          padding: '15px',
          background: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          {message.text}
        </div>
      )}
      
      {/* Stats Cards */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <StatCard 
          label="Pending" 
          value={stats.pending} 
          bgColor="#fff3cd" 
          color="#856404" 
        />
        <StatCard 
          label="Approved" 
          value={stats.approved} 
          bgColor="#d4edda" 
          color="#155724" 
        />
        <StatCard 
          label="Rejected" 
          value={stats.rejected} 
          bgColor="#f8d7da" 
          color="#721c24" 
        />
        <StatCard 
          label="Total" 
          value={stats.total} 
          bgColor="#e2e3e5" 
          color="#383d41" 
        />
        <StatCard 
          label="Avg Rating" 
          value={stats.averageRating._avg.rating?.toFixed(1) || '0'} 
          subvalue="/5"
          bgColor="#cce5ff" 
          color="#004085" 
        />
      </div>
      
      {/* Filters and Search */}
      <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          {['pending', 'approved', 'rejected', 'all'].map(status => (
            <button
              key={status}
              onClick={() => navigate(`/app/comments?status=${status}`)}
              style={{
                padding: '8px 16px',
                background: currentStatus === status ? '#008060' : '#f0f0f0',
                color: currentStatus === status ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: currentStatus === status ? '600' : '400'
              }}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            name="search"
            placeholder="Search comments..."
            defaultValue={currentSearch}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              width: '250px'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              background: '#008060',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </form>
      </div>
      
      {/* Bulk Actions */}
      {selectedComments.length > 0 && (
        <div style={{
          padding: '15px',
          background: '#f8f9fa',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          flexWrap: 'wrap'
        }}>
          <span><strong>{selectedComments.length}</strong> comments selected</span>
          <button
            onClick={() => handleBulkAction('approve')}
            disabled={processing.bulk}
            style={{
              padding: '6px 12px',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: processing.bulk ? 'not-allowed' : 'pointer'
            }}
          >
            Approve Selected
          </button>
          <button
            onClick={() => handleBulkAction('reject')}
            disabled={processing.bulk}
            style={{
              padding: '6px 12px',
              background: '#ffc107',
              color: 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: processing.bulk ? 'not-allowed' : 'pointer'
            }}
          >
            Reject Selected
          </button>
          <button
            onClick={() => handleBulkAction('delete')}
            disabled={processing.bulk}
            style={{
              padding: '6px 12px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: processing.bulk ? 'not-allowed' : 'pointer'
            }}
          >
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedComments([])}
            disabled={processing.bulk}
            style={{
              padding: '6px 12px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: processing.bulk ? 'not-allowed' : 'pointer'
            }}
          >
            Clear Selection
          </button>
        </div>
      )}
      
      {/* Comments Table */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'auto'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
              <th style={{ padding: '12px', width: '30px' }}>
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={selectedComments.length === comments.length && comments.length > 0}
                  disabled={comments.length === 0}
                />
              </th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Customer</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Rating</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Comment</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Product</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {comments.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  No comments found
                </td>
              </tr>
            ) : (
              comments.map(comment => {
                const statusBadge = getStatusBadge(comment.status);
                return (
                  <tr key={comment.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedComments.includes(comment.id)}
                        onChange={() => handleSelectComment(comment.id)}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div>
                        <strong>{comment.customerName || 'Anonymous'}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {comment.customerEmail || 'No email'}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ color: '#ffc107', fontSize: '16px' }}>
                        {'★'.repeat(comment.rating)}{'☆'.repeat(5 - comment.rating)}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {comment.title && (
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                          {comment.title}
                        </div>
                      )}
                      <div style={{ fontSize: '14px', color: '#495057' }}>
                        {comment.comment.length > 100 
                          ? comment.comment.substring(0, 100) + '...' 
                          : comment.comment
                        }
                      </div>
                      {comment.isVerifiedPurchase && (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          background: '#d4edda',
                          color: '#155724',
                          borderRadius: '4px',
                          fontSize: '11px',
                          marginTop: '4px'
                        }}>
                          ✓ Verified Purchase
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {comment.campaign?.productTitle || (
                        <span style={{ fontSize: '12px', color: '#999' }}>
                          Product ID: {comment.productId.slice(-8)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: statusBadge.bg,
                        color: statusBadge.color,
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {statusBadge.text}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {comment.status === 'pending' && (
                          <>
                            <ActionButton
                              onClick={() => handleSingleAction(comment.id, 'approve')}
                              bgColor="#28a745"
                              disabled={processing[comment.id]}
                            >
                              ✓
                            </ActionButton>
                            <ActionButton
                              onClick={() => handleSingleAction(comment.id, 'reject')}
                              bgColor="#ffc107"
                              disabled={processing[comment.id]}
                            >
                              ✗
                            </ActionButton>
                          </>
                        )}
                        <ActionButton
                          onClick={() => handleSingleAction(comment.id, 'delete')}
                          bgColor="#dc3545"
                          disabled={processing[comment.id]}
                        >
                          🗑️
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '5px',
          marginTop: '20px',
          flexWrap: 'wrap'
        }}>
          {/* ... pagination buttons ... */}
        </div>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ label, value, subvalue, bgColor, color }) {
  return (
    <div style={{ background: bgColor, padding: '20px', borderRadius: '8px' }}>
      <div style={{ fontSize: '14px', color, marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '32px', fontWeight: 'bold', color }}>{value}</div>
      {subvalue && <div style={{ fontSize: '14px', color }}>{subvalue}</div>}
    </div>
  );
}

function ActionButton({ onClick, bgColor, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 8px',
        background: bgColor,
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: '14px',
        minWidth: '30px'
      }}
    >
      {children}
    </button>
  );
}