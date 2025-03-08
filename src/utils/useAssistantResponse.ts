// import {useState, useEffect} from 'react';
// import fetchHelper from './fetcher';

// const useAssistantResponse = (threadId: string, runId: string) => {
//   const [status, setStatus] = useState<
//     'queued' | 'in_progress' | 'completed' | 'failed' | null
//   >(null);
//   const [response, setResponse] = useState<string>('');
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     let isSubscribed = true;

//     const pollStatus = async () => {
//       console.log('useAssistantResponse pollStatus started');
//       try {
//         while (isSubscribed) {
//           const statusResponse = await fetchHelper(
//             'checkRunStatus',
//             {
//               thread_id: threadId,
//               run_id: runId,
//             },
//             {},
//           );

//           const data = await statusResponse;
//           console.log('data', data);
//           setStatus(data.status);

//           if (data.status === 'completed') {
//             const messagesResponse = await fetchHelper(
//               'getMessages',
//               {
//                 thread_id: threadId,
//               },
//               {},
//             );
//             const messages = await messagesResponse;
//             console.log('messages', messages);
//             if (messages.data && messages.data[0]?.content[0]?.text?.value) {
//               setResponse(messages.data[0].content[0].text.value);
//             }
//             break;
//           }

//           if (['failed', 'cancelled', 'expired'].includes(data.status)) {
//             setError(`Run ${data.status}`);
//             break;
//           }

//           await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//       } catch (err: unknown) {
//         if (isSubscribed) {
//           setError(
//             err instanceof Error ? err.message : 'An unknown error occurred',
//           );
//         }
//       }
//     };
//     console.log('useAssistantResponse threadId', threadId);
//     console.log('useAssistantResponse runId', runId);
//     if (threadId && runId) {
//       console.log('useAssistantResponse threadId and runId', threadId, runId);
//       console.log('useAssistantResponse pollStatus');
//       pollStatus();
//     }

//     return () => {
//       isSubscribed = false;
//     };
//   }, [threadId, runId]);

//   return {status, response, error};
// };

// export default useAssistantResponse;
