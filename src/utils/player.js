// curl https://api.openai.com/v1/threads/thread_CrzjFzu1UAZnsdAXiYaXbtgb/runs/run_2QBXoP7TTo9DEGcVm51YrFUc \
//   -H "Authorization: Bearer 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" \
//   -H "OpenAI-Beta: assistants=v2"

// console.log('Starting image generation');
// const options = {
//   method: 'POST',
//   headers: {
//     accept: 'application/json',
//     'content-type': 'application/json',
//     authorization:
//       'Bearer 87b780bc3a3781f203761cefffb755fb39d9f061b8840f066df0279b80f2647a',
//   },
//   body: JSON.stringify({
//     model: 'black-forest-labs/FLUX.1-schnell-Free',
//     steps: 4,
//     n: 1,
//     height: 256,
//     width: 256,
//     guidance: 3.5,
//     output_format: 'jpeg',
//     prompt: 'create an image of a kid describing a feeling of sadness',
//     image_url: 'string',
//     seed: 0,
//     negative_prompt: 'string',
//     response_format: 'url',
//   }),
// };

// fetch('https://api.together.xyz/v1/images/generations', options)
//   .then(res => res.json())
//   .then(res => console.log(res))
//   .catch(err => console.error(err));
