import { AlertCircle } from 'lucide-react'

interface MissingField {
  name: string
  description: string
  required: boolean
}

interface MissingDataAlertProps {
  missingFields: MissingField[]
}

export function MissingDataAlert({ missingFields }: MissingDataAlertProps) {
  if (missingFields.length === 0) return null

  const required = missingFields.filter(f => f.required)
  const optional = missingFields.filter(f => !f.required)

  return (
    <div className="glass rounded-xl p-4 border-l-4 border-status-warning">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-status-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary mb-2">⚠️ 信息缺失提示</h3>

          {required.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-text-secondary mb-2">
                <strong>必须补充：</strong>以下信息缺失会影响分析质量
              </p>
              <ul className="space-y-1">
                {required.map((field, idx) => (
                  <li key={idx} className="text-sm text-text-secondary flex items-start gap-2">
                    <span className="text-status-error">❌</span>
                    <span>
                      <strong>{field.name}：</strong>{field.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {optional.length > 0 && (
            <div>
              <p className="text-sm text-text-secondary mb-2">
                <strong>建议补充：</strong>以下信息可提升分析准确度
              </p>
              <ul className="space-y-1">
                {optional.map((field, idx) => (
                  <li key={idx} className="text-sm text-text-secondary flex items-start gap-2">
                    <span className="text-status-warning">⚠️</span>
                    <span>
                      <strong>{field.name}：</strong>{field.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
