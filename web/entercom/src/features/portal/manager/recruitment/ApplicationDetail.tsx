import { useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock, FileText, User, Briefcase } from 'lucide-react';
import { PageHeader } from '../../../../shared/components/PageHeader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../../api/axios';

export default function ApplicationDetail() {
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  
  const backUrl = location.pathname.includes('/admin/') ? '/portal/admin/recruitment' : '/portal/manager/recruitment';

  const { data: app, isLoading } = useQuery({
    queryKey: ['technician-application', id],
    queryFn: async () => {
      const response = await apiClient.get(`/users/technician-applications/${id}/`);
      return response.data;
    },
    enabled: !!id,
  });

  const decideMutation = useMutation({
    mutationFn: async ({ action, notes }: { action: string, notes: string }) => {
      const response = await apiClient.post(`/users/technician-applications/${id}/decide/`, {
        status: action,
        notes: notes,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technician-application', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-technician-applications'] });
      queryClient.invalidateQueries({ queryKey: ['manager-technician-applications'] });
      setNotes('');
      window.showAppAlert(`Application updated successfully.`, 'success');
    },
    onError: (error: any) => {
      window.showAppAlert(error?.response?.data?.error || 'Failed to update application.', 'error');
    }
  });

  const handleAction = async (action: string) => {
    decideMutation.mutate({ action, notes });
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ess-purple"></div></div>;
  }

  if (!app) return <div className="p-8 text-center text-gray-500">Application not found</div>;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <Link to={backUrl} className="inline-flex items-center text-sm text-gray-500 hover:text-ess-purple transition-colors mb-4">
        <ArrowLeft size={16} className="mr-1" /> Back to Recruitment
      </Link>

      <PageHeader 
        title={`Application: ${app.first_name} ${app.last_name}`} 
        description={`Applying for ${app.form_data?.position || 'Technician'}`}
        icon={User}
      >
        <span className={`ml-4 px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${
          app.status === 'approved' ? 'bg-green-100 text-green-800' : 
          app.status === 'rejected' ? 'bg-red-100 text-red-800' : 
          app.status === 'under_review' ? 'bg-blue-100 text-blue-800' : 
          'bg-yellow-100 text-yellow-800'
        }`}>
          {app.status.replace('_', ' ').toUpperCase()}
        </span>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><User className="mr-2" size={20} /> Applicant Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-sm text-gray-500">Email</p><p className="font-medium text-gray-900">{app.user_email}</p></div>
              <div><p className="text-sm text-gray-500">Phone</p><p className="font-medium text-gray-900">{app.form_data?.phone || 'N/A'}</p></div>
              <div><p className="text-sm text-gray-500">Applied On</p><p className="font-medium text-gray-900">{new Date(app.created_at).toLocaleString()}</p></div>
              <div><p className="text-sm text-gray-500">Location</p><p className="font-medium text-gray-900">{app.form_data?.state || 'N/A'}</p></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><Briefcase className="mr-2" size={20} /> Qualifications</h3>
            <div className="space-y-4">
              <div><p className="text-sm text-gray-500 mb-1">Skills & Areas of Expertise</p>
                <div className="flex flex-wrap gap-2">
                  {app.skills?.map((skill: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-sm">{skill}</span>
                  ))}
                </div>
              </div>
              <div><p className="text-sm text-gray-500 mb-1">Previous Experience</p>
                {app.form_data?.work1_company && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-semibold text-gray-900">{app.form_data.work1_company} - {app.form_data.work1_role}</p>
                    <p className="text-sm text-gray-500">{app.form_data.work1_period}</p>
                    <p className="text-sm mt-1">{app.form_data.work1_responsibilities}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><FileText className="mr-2" size={20} /> Attached Documents</h3>
            <div className="space-y-2">
              {app.document_urls?.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <FileText className="text-ess-purple mr-3" size={20} />
                  <span className="font-medium text-gray-900 truncate">Document {i + 1}</span>
                </a>
              ))}
              {(!app.document_urls || app.document_urls.length === 0) && (
                <p className="text-gray-500">No documents attached.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><CheckCircle className="mr-2 text-ess-purple" size={20} /> Review Actions</h3>
            {app.status === 'pending' || app.status === 'under_review' ? (
              <div className="space-y-4">
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-ess-purple focus:border-ess-purple"
                  rows={3}
                  placeholder="Add internal notes for this decision..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <button
                  onClick={() => handleAction('approved')}
                  disabled={decideMutation.isPending}
                  className="w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex justify-center disabled:opacity-50"
                >
                  {decideMutation.isPending ? 'Processing...' : 'Approve Application'}
                </button>
                <button
                  onClick={() => handleAction('rejected')}
                  disabled={decideMutation.isPending}
                  className="w-full py-2 border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors flex justify-center disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-sm text-gray-700 font-medium mb-1">Decision Finalized</p>
                <p className="text-xs text-gray-500">This application has been marked as <strong className="uppercase">{app.status.replace('_', ' ')}</strong>.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center"><Clock className="mr-2" size={20} /> Application Timeline</h3>
            <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
              {app.activities?.map((activity: any) => (
                <div key={activity.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1 bg-white rounded-full p-1">
                    <div className="w-2 h-2 bg-ess-purple rounded-full" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{activity.action}</p>
                    <p className="text-xs text-gray-500">{new Date(activity.created_at).toLocaleString()} • {activity.actor_name || 'System'}</p>
                    {activity.details && <p className="text-sm text-gray-600 mt-1">{activity.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
