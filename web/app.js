const modal = document.getElementById('modal');
function openModal(service){document.getElementById('modalTitle').textContent=service;document.getElementById('serviceField').value=service;modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
function closeModal(){modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''}
function toggleNav(){document.querySelector('.nav nav').classList.toggle('mobile-open')}
async function submitRequest(e){
  e.preventDefault();
  const form=e.target;
  const email=document.getElementById('email').value.trim();
  const phone=document.getElementById('phone').value.trim();
  if(!email&&!phone){alert('Please enter an email address or contact number so we can acknowledge your request.');return;}
  const file=document.getElementById('attachment').files[0];
  if(file && (file.type!=='application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))){alert('Please upload a PDF file only.');return;}
  if(file && file.size>10*1024*1024){alert('PDF must be 10 MB or smaller.');return;}
  const formData=new FormData();
  ['serviceField','name','email','phone','details'].forEach(id=>formData.append(({serviceField:'service'})[id]||id,document.getElementById(id).value.trim()));
  if(file)formData.append('attachment',file);
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;button.textContent='Submitting…';
  try{
    const response=await fetch('/api/requests',{method:'POST',body:formData});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Request failed');
    closeModal();form.reset();
    const ack=data.request?.acknowledgement||{};
    let msg=`Request submitted successfully!\nRequest ID: ${data.request.id}\nService: ${data.request.service}`;
    if(ack.email==='sent')msg+='\nEmail acknowledgement sent.';else if(email)msg+='\nEmail acknowledgement is not configured or could not be sent yet.';
    if(ack.sms==='sent')msg+='\nSMS acknowledgement sent.';else if(phone)msg+='\nSMS acknowledgement is not configured or could not be sent yet.';
    alert(msg);
  }catch(err){alert(`Unable to submit request: ${err.message}`)}
  finally{button.disabled=false;button.textContent='Submit request →';}
}
modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
